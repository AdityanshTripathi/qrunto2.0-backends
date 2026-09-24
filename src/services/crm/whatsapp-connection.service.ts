import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { WhatsAppConnectionSource, WhatsAppConnectionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface BrandWhatsAppProvider { phoneNumberId: string; accessToken: string; languageCode: string }

export interface WhatsAppConnectionStatusView {
  configured: boolean;
  phoneNumberId: string | null;
  languageCode: string | null;
  status: WhatsAppConnectionStatus;
  source: WhatsAppConnectionSource | null;
  displayPhoneNumber: string | null;
  displayName: string | null;
  connectedAt: Date | null;
  lastValidatedAt: Date | null;
  lastTemplateSyncAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface VerifiedEmbeddedSignupConnection {
  phoneNumberId: string;
  accessToken: string;
  languageCode: string;
  wabaId: string;
  metaBusinessId?: string | null;
  displayName?: string | null;
  displayPhoneNumber?: string | null;
  tokenExpiresAt?: Date | null;
}

export interface WhatsAppConnectionIdentity {
  connectionVersion: string;
}

export interface ActiveWhatsAppTemplateSnapshot extends WhatsAppConnectionIdentity {
  brandId: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

export type WhatsAppConnectionErrorCode =
  | 'META_AUTHENTICATION_FAILED'
  | 'META_PERMISSION_DENIED'
  | 'META_CONNECTION_UNAVAILABLE'
  | 'META_VALIDATION_FAILED'
  | 'META_TEMPLATE_SYNC_FAILED'
  | 'UNKNOWN_FAILURE';

const errorMessages: Record<WhatsAppConnectionErrorCode, string> = {
  META_AUTHENTICATION_FAILED: 'WhatsApp authentication requires reconnection.',
  META_PERMISSION_DENIED: 'WhatsApp permissions need attention.',
  META_CONNECTION_UNAVAILABLE: 'WhatsApp is temporarily unavailable.',
  META_VALIDATION_FAILED: 'WhatsApp connection validation failed.',
  META_TEMPLATE_SYNC_FAILED: 'WhatsApp template synchronization failed.',
  UNKNOWN_FAILURE: 'WhatsApp connection operation failed.',
};

function encryptionKey(): Buffer {
  const raw = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('CRM credential encryption key is not configured');
  return Buffer.from(raw, 'hex');
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decrypt(value: string): string {
  const [iv, tag, ciphertext] = value.split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Invalid encrypted WhatsApp credential');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

function usableStatus(status: WhatsAppConnectionStatus): boolean {
  return status === WhatsAppConnectionStatus.LEGACY_CONNECTED || status === WhatsAppConnectionStatus.CONNECTED;
}

function maskedPhoneNumber(value: string | null): string | null {
  if (!value) return null;
  const visible = value.slice(-4);
  return `${'*'.repeat(Math.max(4, value.length - visible.length))}${visible}`;
}

function errorCode(value: string | null | undefined, fallback: WhatsAppConnectionErrorCode | null = null): WhatsAppConnectionErrorCode | null {
  return value && Object.prototype.hasOwnProperty.call(errorMessages, value)
    ? value as WhatsAppConnectionErrorCode
    : fallback;
}

function errorData(code: WhatsAppConnectionErrorCode | null): { lastErrorCode: string | null; lastErrorMessage: string | null } {
  return code ? { lastErrorCode: code, lastErrorMessage: errorMessages[code] } : { lastErrorCode: null, lastErrorMessage: null };
}

function identityWhere(brandId: string, identity: WhatsAppConnectionIdentity) {
  return { brandId, connectionVersion: identity.connectionVersion };
}

function connectionUnavailable(status: WhatsAppConnectionStatus): Error {
  return Object.assign(new Error('WhatsApp connection is unavailable'), {
    code: 'WHATSAPP_CONNECTION_UNAVAILABLE', status,
  });
}

export class WhatsAppConnectionService {
  async getActiveTemplateSnapshot(brandId: string): Promise<ActiveWhatsAppTemplateSnapshot> {
    const row = await prisma.brandWhatsAppConnection.findUnique({
      where: { brandId }, select: {
        brandId: true, wabaId: true, phoneNumberId: true, connectionVersion: true, encryptedAccessToken: true,
        status: true, source: true, tokenExpiresAt: true,
      },
    });
    if (!row || row.status !== WhatsAppConnectionStatus.CONNECTED ||
        row.source !== WhatsAppConnectionSource.EMBEDDED_SIGNUP || !row.wabaId ||
        (row.tokenExpiresAt !== null && row.tokenExpiresAt <= new Date())) {
      throw Object.assign(new Error('WhatsApp verified connection is unavailable'), {
        code: 'WHATSAPP_VERIFIED_CONNECTION_REQUIRED',
      });
    }
    return {
      brandId: row.brandId, wabaId: row.wabaId, phoneNumberId: row.phoneNumberId, connectionVersion: row.connectionVersion,
      accessToken: decrypt(row.encryptedAccessToken),
    };
  }

  // Re-check immediately before external dispatch so a queued campaign fails
  // closed if its connection was disconnected, rotated, or expired meanwhile.
  async assertCurrentVerified(brandId: string, identity: WhatsAppConnectionIdentity): Promise<void> {
    const row = await prisma.brandWhatsAppConnection.findFirst({
      where: {
        brandId,
        connectionVersion: identity.connectionVersion,
        status: WhatsAppConnectionStatus.CONNECTED,
        source: WhatsAppConnectionSource.EMBEDDED_SIGNUP,
        wabaId: { not: null },
        OR: [{ tokenExpiresAt: null }, { tokenExpiresAt: { gt: new Date() } }],
      },
      select: { connectionVersion: true },
    });
    if (!row) throw Object.assign(new Error('WhatsApp verified connection is unavailable'), {
      code: 'WHATSAPP_VERIFIED_CONNECTION_REQUIRED',
    });
  }

  async get(brandId: string): Promise<BrandWhatsAppProvider | null> {
    const row = await prisma.brandWhatsAppConnection.findUnique({
      where: { brandId }, select: { phoneNumberId: true, encryptedAccessToken: true, languageCode: true, status: true },
    });
    if (!row) return null;
    if (!usableStatus(row.status)) throw connectionUnavailable(row.status);
    return { phoneNumberId: row.phoneNumberId, accessToken: decrypt(row.encryptedAccessToken), languageCode: row.languageCode };
  }

  async status(brandId: string): Promise<WhatsAppConnectionStatusView> {
    const row = await prisma.brandWhatsAppConnection.findUnique({
      where: { brandId }, select: {
        phoneNumberId: true, languageCode: true, status: true, source: true, displayPhoneNumber: true, displayName: true,
        connectedAt: true, lastValidatedAt: true, lastTemplateSyncAt: true, lastErrorCode: true, lastErrorMessage: true, tokenExpiresAt: true,
      },
    });
    if (!row) return {
      configured: false, phoneNumberId: null, languageCode: null, status: WhatsAppConnectionStatus.DISCONNECTED,
      source: null, displayPhoneNumber: null, displayName: null, connectedAt: null, lastValidatedAt: null,
      lastTemplateSyncAt: null, lastErrorCode: null, lastErrorMessage: null,
    };
    const expired = row.tokenExpiresAt !== null && row.tokenExpiresAt <= new Date();
    return {
      configured: !expired && usableStatus(row.status), phoneNumberId: row.phoneNumberId, languageCode: row.languageCode,
      status: expired ? WhatsAppConnectionStatus.NEEDS_REAUTH : row.status, source: row.source, displayPhoneNumber: maskedPhoneNumber(row.displayPhoneNumber),
      displayName: row.displayName, connectedAt: row.connectedAt, lastValidatedAt: row.lastValidatedAt,
      lastTemplateSyncAt: row.lastTemplateSyncAt,
      lastErrorCode: expired ? 'META_AUTHENTICATION_FAILED' : errorCode(row.lastErrorCode),
      lastErrorMessage: expired ? errorMessages.META_AUTHENTICATION_FAILED : (errorCode(row.lastErrorCode) ? errorMessages[errorCode(row.lastErrorCode)!] : null),
    };
  }

  async save(brandId: string, phoneNumberId: string, accessToken: string, languageCode: string) {
    const encryptedAccessToken = encrypt(accessToken);
    const existing = await prisma.brandWhatsAppConnection.findUnique({ where: { brandId }, select: { source: true } });
    const now = new Date();
    const connectionVersion = randomUUID();
    if (!existing) {
      await prisma.brandWhatsAppConnection.create({
        data: {
          brandId, phoneNumberId, connectionVersion, encryptedAccessToken, languageCode, source: WhatsAppConnectionSource.MANUAL,
          status: WhatsAppConnectionStatus.LEGACY_CONNECTED, connectedAt: now, lastValidatedAt: null,
          lastTemplateSyncAt: null, ...errorData(null),
        },
      });
      return;
    }
    if (existing.source !== WhatsAppConnectionSource.MANUAL) {
      throw Object.assign(new Error('WhatsApp connection is managed through Embedded Signup'), {
        code: 'WHATSAPP_CONNECTION_MANAGED',
      });
    }
    const updated = await prisma.brandWhatsAppConnection.updateMany({
      where: { brandId, source: WhatsAppConnectionSource.MANUAL },
      data: {
        phoneNumberId, connectionVersion, encryptedAccessToken, languageCode, status: WhatsAppConnectionStatus.LEGACY_CONNECTED,
        connectedAt: now, lastValidatedAt: null, lastTemplateSyncAt: null, ...errorData(null),
      },
    });
    if (updated.count !== 1) throw Object.assign(new Error('WhatsApp connection is managed through Embedded Signup'), {
      code: 'WHATSAPP_CONNECTION_MANAGED',
    });
  }

  // This method is intentionally only for details verified by the later server-side signup flow.
  async saveVerifiedEmbeddedSignupConnection(brandId: string, connection: VerifiedEmbeddedSignupConnection): Promise<void> {
    if (!connection.phoneNumberId || !connection.accessToken || !connection.wabaId) {
      throw new Error('Verified WhatsApp connection details are incomplete');
    }
    const encryptedAccessToken = encrypt(connection.accessToken);
    const now = new Date();
    const connectionVersion = randomUUID();
    await prisma.brandWhatsAppConnection.upsert({
      where: { brandId },
      create: {
        brandId, phoneNumberId: connection.phoneNumberId, connectionVersion, encryptedAccessToken, languageCode: connection.languageCode,
        wabaId: connection.wabaId, metaBusinessId: connection.metaBusinessId ?? null,
        displayName: connection.displayName ?? null, displayPhoneNumber: connection.displayPhoneNumber ?? null,
        tokenExpiresAt: connection.tokenExpiresAt ?? null, status: WhatsAppConnectionStatus.CONNECTED,
        source: WhatsAppConnectionSource.EMBEDDED_SIGNUP, connectedAt: now, lastValidatedAt: now, lastTemplateSyncAt: null,
      },
      update: {
        phoneNumberId: connection.phoneNumberId, connectionVersion, encryptedAccessToken, languageCode: connection.languageCode,
        wabaId: connection.wabaId, metaBusinessId: connection.metaBusinessId ?? null,
        displayName: connection.displayName ?? null, displayPhoneNumber: connection.displayPhoneNumber ?? null,
        tokenExpiresAt: connection.tokenExpiresAt ?? null, status: WhatsAppConnectionStatus.CONNECTED,
        source: WhatsAppConnectionSource.EMBEDDED_SIGNUP, connectedAt: now, lastValidatedAt: now,
        lastTemplateSyncAt: null, ...errorData(null),
      },
    });
  }

  async markNeedsReauth(brandId: string, identity: WhatsAppConnectionIdentity, code?: WhatsAppConnectionErrorCode): Promise<boolean> {
    const normalizedCode = errorCode(code, 'META_AUTHENTICATION_FAILED')!;
    const result = await prisma.brandWhatsAppConnection.updateMany({
      where: identityWhere(brandId, identity),
      data: { status: WhatsAppConnectionStatus.NEEDS_REAUTH, ...errorData(normalizedCode) },
    });
    return result.count === 1;
  }

  async markValidated(brandId: string, identity: WhatsAppConnectionIdentity): Promise<boolean> {
    const result = await prisma.brandWhatsAppConnection.updateMany({
      where: { ...identityWhere(brandId, identity), status: { in: [WhatsAppConnectionStatus.LEGACY_CONNECTED, WhatsAppConnectionStatus.CONNECTED] } },
      data: { lastValidatedAt: new Date(), ...errorData(null) },
    });
    return result.count === 1;
  }

  async recordSafeError(brandId: string, identity: WhatsAppConnectionIdentity, code?: WhatsAppConnectionErrorCode): Promise<boolean> {
    const normalizedCode = errorCode(code, 'UNKNOWN_FAILURE')!;
    const result = await prisma.brandWhatsAppConnection.updateMany({
      where: identityWhere(brandId, identity), data: errorData(normalizedCode),
    });
    return result.count === 1;
  }

  async markTemplatesSynced(brandId: string, identity: WhatsAppConnectionIdentity): Promise<boolean> {
    const result = await prisma.brandWhatsAppConnection.updateMany({
      where: { ...identityWhere(brandId, identity), status: { in: [WhatsAppConnectionStatus.LEGACY_CONNECTED, WhatsAppConnectionStatus.CONNECTED] } },
      data: { lastTemplateSyncAt: new Date() },
    });
    return result.count === 1;
  }

  // The schema keeps encryptedAccessToken non-null. An explicit disconnect therefore removes only
  // this brand's connection record; campaign and message-history records are not related to it.
  async disconnect(brandId: string, identity: WhatsAppConnectionIdentity): Promise<boolean> {
    const result = await prisma.brandWhatsAppConnection.deleteMany({ where: identityWhere(brandId, identity) });
    return result.count === 1;
  }
}
