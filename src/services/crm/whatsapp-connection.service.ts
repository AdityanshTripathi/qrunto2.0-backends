import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma';

export interface BrandWhatsAppProvider { phoneNumberId: string; accessToken: string; languageCode: string }

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

export class WhatsAppConnectionService {
  async get(brandId: string): Promise<BrandWhatsAppProvider | null> {
    const row = await prisma.brandWhatsAppConnection.findUnique({ where: { brandId } });
    if (!row) return null;
    return { phoneNumberId: row.phoneNumberId, accessToken: decrypt(row.encryptedAccessToken), languageCode: row.languageCode };
  }

  async status(brandId: string): Promise<{ configured: boolean; phoneNumberId: string | null; languageCode: string | null }> {
    const row = await prisma.brandWhatsAppConnection.findUnique({
      where: { brandId }, select: { phoneNumberId: true, languageCode: true },
    });
    return { configured: Boolean(row), phoneNumberId: row?.phoneNumberId ?? null, languageCode: row?.languageCode ?? null };
  }

  async save(brandId: string, phoneNumberId: string, accessToken: string, languageCode: string) {
    const encryptedAccessToken = encrypt(accessToken);
    await prisma.brandWhatsAppConnection.upsert({
      where: { brandId },
      create: { brandId, phoneNumberId, encryptedAccessToken, languageCode },
      update: { phoneNumberId, encryptedAccessToken, languageCode },
    });
  }
}
