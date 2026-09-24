import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import {
  VerifiedEmbeddedSignupConnection,
  WhatsAppConnectionService,
} from './whatsapp-connection.service';

const SIGNUP_TTL_MS = 10 * 60_000;
const META_REQUEST_TIMEOUT_MS = 15_000;
const REQUIRED_PERMISSIONS = [
  'whatsapp_business_management',
  'whatsapp_business_messaging',
] as const;

interface PublicMetaConfiguration {
  appId: string;
  configId: string;
  graphApiVersion: string;
}

interface MetaConfiguration extends PublicMetaConfiguration {
  appSecret: string;
}

interface TokenExchangeResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

interface DebugTokenResponse {
  data?: {
    app_id?: unknown;
    expires_at?: unknown;
    granular_scopes?: unknown;
    is_valid?: unknown;
    scopes?: unknown;
  };
}

interface MetaWabaResponse {
  id?: unknown;
  name?: unknown;
  owner_business_info?: { id?: unknown } | null;
}

interface MetaPhoneNumbersResponse {
  data?: unknown;
  paging?: { next?: unknown };
}

interface VerifiedConnectionWriter {
  saveVerifiedEmbeddedSignupConnection(
    brandId: string,
    connection: VerifiedEmbeddedSignupConnection,
  ): Promise<void>;
}

export class EmbeddedSignupError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new EmbeddedSignupError(
      'WHATSAPP_SIGNUP_CONFIG_MISSING',
      503,
      'WhatsApp Embedded Signup is not configured',
    );
  }
  return value;
}

function publicConfiguration(): PublicMetaConfiguration {
  const appId = requiredEnvironment('WHATSAPP_META_APP_ID');
  const configId = requiredEnvironment('WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID');
  const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v26.0';
  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    throw new EmbeddedSignupError(
      'WHATSAPP_SIGNUP_CONFIG_INVALID',
      503,
      'WhatsApp Embedded Signup is not configured',
    );
  }
  return { appId, configId, graphApiVersion };
}

function completeConfiguration(): MetaConfiguration {
  return { ...publicConfiguration(), appSecret: requiredEnvironment('WHATSAPP_APP_SECRET') };
}

function stateHash(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function intersectTargets(current: Set<string> | null, next: Set<string>): Set<string> {
  if (current === null) return next;
  return new Set([...current].filter(target => next.has(target)));
}

function safeAttemptFailure(error: unknown): { code: string; message: string } {
  if (error instanceof EmbeddedSignupError) {
    return { code: error.code, message: error.publicMessage };
  }
  return { code: 'WHATSAPP_SIGNUP_FAILED', message: 'WhatsApp signup could not be completed' };
}

async function jsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new EmbeddedSignupError(
      'META_RESPONSE_INVALID',
      502,
      'WhatsApp signup provider returned an invalid response',
    );
  }
}

export class MetaEmbeddedSignupService {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly connectionWriter: VerifiedConnectionWriter = new WhatsAppConnectionService(),
  ) {}

  async start(brandId: string, actorUserId: string): Promise<{
    appId: string;
    configId: string;
    graphApiVersion: string;
    state: string;
    expiresAt: string;
  }> {
    const completeConfig = completeConfiguration();
    const config: PublicMetaConfiguration = {
      appId: completeConfig.appId,
      configId: completeConfig.configId,
      graphApiVersion: completeConfig.graphApiVersion,
    };
    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SIGNUP_TTL_MS);
    await prisma.brandWhatsAppConnectionAttempt.create({
      data: {
        brandId,
        actorUserId,
        stateHash: stateHash(state),
        expiresAt,
      },
    });
    return { ...config, state, expiresAt: expiresAt.toISOString() };
  }

  async complete(brandId: string, actorUserId: string, state: string, code: string): Promise<void> {
    const hash = stateHash(state);
    const consumedAt = new Date();
    const claimed = await prisma.brandWhatsAppConnectionAttempt.updateMany({
      where: {
        stateHash: hash,
        brandId,
        actorUserId,
        consumedAt: null,
        completedAt: null,
        failedAt: null,
        expiresAt: { gt: consumedAt },
      },
      data: { consumedAt },
    });
    if (claimed.count !== 1) {
      throw new EmbeddedSignupError(
        'WHATSAPP_SIGNUP_STATE_INVALID',
        409,
        'WhatsApp signup state is invalid, expired, or already used',
      );
    }

    try {
      const config = completeConfiguration();
      const token = await this.exchangeCode(config, code);
      const connection = await this.verifyConnection(config, token.accessToken, token.tokenExpiresAt);
      const phoneOwner = await prisma.brandWhatsAppConnection.findUnique({
        where: { phoneNumberId: connection.phoneNumberId },
        select: { brandId: true },
      });
      if (phoneOwner && phoneOwner.brandId !== brandId) {
        throw new EmbeddedSignupError(
          'WHATSAPP_PHONE_ALREADY_CONNECTED',
          409,
          'This WhatsApp phone number is already connected',
        );
      }
      // Reauthorization restores the existing sender. A different WABA or phone
      // requires an explicit future replacement flow, never a silent overwrite.
      const existingBrandConnection = await prisma.brandWhatsAppConnection.findUnique({
        where: { brandId }, select: { phoneNumberId: true, wabaId: true, source: true },
      });
      if (existingBrandConnection?.source === 'EMBEDDED_SIGNUP' &&
          (existingBrandConnection.phoneNumberId !== connection.phoneNumberId || existingBrandConnection.wabaId !== connection.wabaId)) {
        throw new EmbeddedSignupError(
          'WHATSAPP_REAUTH_IDENTITY_MISMATCH',
          409,
          'The selected WhatsApp account or phone number does not match this connection',
        );
      }
      await this.connectionWriter.saveVerifiedEmbeddedSignupConnection(brandId, connection);
      await prisma.brandWhatsAppConnectionAttempt.update({
        where: { stateHash: hash },
        data: { completedAt: new Date(), failureCode: null, failureMessage: null },
      });
    } catch (error) {
      const failure = safeAttemptFailure(error);
      try {
        await prisma.brandWhatsAppConnectionAttempt.update({
          where: { stateHash: hash },
          data: { failedAt: new Date(), failureCode: failure.code, failureMessage: failure.message },
        });
      } catch {
        // Do not replace the safe provider error with an attempt-audit write failure.
      }
      if (error instanceof EmbeddedSignupError) throw error;
      throw new EmbeddedSignupError(
        'WHATSAPP_SIGNUP_FAILED',
        502,
        'WhatsApp signup could not be completed',
      );
    }
  }

  private async exchangeCode(
    config: MetaConfiguration,
    code: string,
  ): Promise<{ accessToken: string; tokenExpiresAt: Date | null }> {
    const body = new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      code,
    });
    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://graph.facebook.com/${config.graphApiVersion}/oauth/access_token`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      throw new EmbeddedSignupError(
        'META_CONNECTION_UNAVAILABLE',
        502,
        'WhatsApp signup provider is temporarily unavailable',
      );
    }
    const payload = await jsonResponse(response) as TokenExchangeResponse;
    const accessToken = stringValue(payload.access_token);
    if (!response.ok || !accessToken) {
      throw new EmbeddedSignupError(
        response.status >= 500 ? 'META_CONNECTION_UNAVAILABLE' : 'META_AUTHORIZATION_CODE_INVALID',
        response.status >= 500 ? 502 : 400,
        response.status >= 500
          ? 'WhatsApp signup provider is temporarily unavailable'
          : 'WhatsApp signup authorization could not be verified',
      );
    }
    const expiresIn = typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in) && payload.expires_in > 0
      ? payload.expires_in
      : null;
    return {
      accessToken,
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    };
  }

  private async verifyConnection(
    config: MetaConfiguration,
    accessToken: string,
    tokenExpiresAt: Date | null,
  ): Promise<VerifiedEmbeddedSignupConnection> {
    const debugUrl = new URL(`https://graph.facebook.com/${config.graphApiVersion}/debug_token`);
    debugUrl.searchParams.set('input_token', accessToken);
    debugUrl.searchParams.set('fields', 'is_valid,app_id,expires_at,scopes,granular_scopes');
    const debugPayload = await this.graphJson(debugUrl, `${config.appId}|${config.appSecret}`) as DebugTokenResponse;
    const debug = debugPayload.data;
    if (!debug || debug.is_valid !== true || String(debug.app_id ?? '') !== config.appId) {
      throw new EmbeddedSignupError(
        'META_TOKEN_INVALID',
        400,
        'WhatsApp signup authorization could not be verified',
      );
    }
    if (typeof debug.expires_at === 'number' && debug.expires_at > 0 && debug.expires_at * 1000 <= Date.now()) {
      throw new EmbeddedSignupError(
        'META_TOKEN_EXPIRED',
        400,
        'WhatsApp signup authorization has expired',
      );
    }

    const grantedScopes = Array.isArray(debug.scopes)
      ? new Set(debug.scopes.filter((scope): scope is string => typeof scope === 'string'))
      : new Set<string>();
    const granularScopes = Array.isArray(debug.granular_scopes)
      ? debug.granular_scopes.filter(isRecord)
      : [];
    let eligibleWabas: Set<string> | null = null;
    for (const permission of REQUIRED_PERMISSIONS) {
      if (!grantedScopes.has(permission)) {
        throw new EmbeddedSignupError(
          'META_PERMISSION_DENIED',
          403,
          'Required WhatsApp permissions were not granted',
        );
      }
      const scope = granularScopes.find(item => item['scope'] === permission);
      const targets = Array.isArray(scope?.['target_ids'])
        ? new Set(scope['target_ids'].filter((target): target is string => typeof target === 'string' && target.length > 0))
        : new Set<string>();
      if (targets.size === 0) {
        throw new EmbeddedSignupError(
          'META_PERMISSION_DENIED',
          403,
          'Required WhatsApp asset permissions were not granted',
        );
      }
      eligibleWabas = intersectTargets(eligibleWabas, targets);
    }
    if (!eligibleWabas || eligibleWabas.size === 0) {
      throw new EmbeddedSignupError(
        'META_WABA_UNAVAILABLE',
        400,
        'No verified WhatsApp Business Account is available',
      );
    }
    if (eligibleWabas.size !== 1) {
      throw new EmbeddedSignupError(
        'WHATSAPP_SIGNUP_SELECTION_REQUIRED',
        409,
        'More than one WhatsApp Business Account is available; a verified selection is required',
      );
    }
    const wabaId = [...eligibleWabas][0]!;
    const wabaUrl = new URL(`https://graph.facebook.com/${config.graphApiVersion}/${encodeURIComponent(wabaId)}`);
    wabaUrl.searchParams.set('fields', 'id,name,owner_business_info');
    const waba = await this.graphJson(wabaUrl, accessToken) as MetaWabaResponse;
    if (stringValue(waba.id) !== wabaId) {
      throw new EmbeddedSignupError(
        'META_WABA_VALIDATION_FAILED',
        400,
        'WhatsApp Business Account ownership could not be verified',
      );
    }

    const phonesUrl = new URL(
      `https://graph.facebook.com/${config.graphApiVersion}/${encodeURIComponent(wabaId)}/phone_numbers`,
    );
    phonesUrl.searchParams.set('fields', 'id,display_phone_number,verified_name');
    const phonesPayload = await this.graphJson(phonesUrl, accessToken) as MetaPhoneNumbersResponse;
    const phones = Array.isArray(phonesPayload.data) ? phonesPayload.data.filter(isRecord) : [];
    if (phones.length === 0) {
      throw new EmbeddedSignupError(
        'META_PHONE_UNAVAILABLE',
        400,
        'No verified WhatsApp phone number is available',
      );
    }
    if (phones.length !== 1 || stringValue(phonesPayload.paging?.next)) {
      throw new EmbeddedSignupError(
        'WHATSAPP_SIGNUP_SELECTION_REQUIRED',
        409,
        'More than one WhatsApp phone number is available; a verified selection is required',
      );
    }
    const phoneNumberId = stringValue(phones[0]?.['id']);
    if (!phoneNumberId) {
      throw new EmbeddedSignupError(
        'META_PHONE_VALIDATION_FAILED',
        400,
        'WhatsApp phone number ownership could not be verified',
      );
    }
    return {
      phoneNumberId,
      accessToken,
      languageCode: 'en_US',
      wabaId,
      metaBusinessId: stringValue(waba.owner_business_info?.id),
      displayName: stringValue(phones[0]?.['verified_name']) ?? stringValue(waba.name),
      displayPhoneNumber: stringValue(phones[0]?.['display_phone_number']),
      tokenExpiresAt,
    };
  }

  private async graphJson(url: URL, accessToken: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new EmbeddedSignupError(
        'META_CONNECTION_UNAVAILABLE',
        502,
        'WhatsApp signup provider is temporarily unavailable',
      );
    }
    const payload = await jsonResponse(response);
    if (!response.ok) {
      throw new EmbeddedSignupError(
        response.status === 401 || response.status === 403 ? 'META_PERMISSION_DENIED' : 'META_CONNECTION_UNAVAILABLE',
        response.status === 401 || response.status === 403 ? 403 : 502,
        response.status === 401 || response.status === 403
          ? 'Required WhatsApp permissions were not granted'
          : 'WhatsApp signup provider is temporarily unavailable',
      );
    }
    return payload;
  }
}
