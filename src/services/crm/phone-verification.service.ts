import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { WhatsAppService } from '../whatsapp.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';

const CODE_LIFETIME_MS = 5 * 60_000;
const SESSION_LIFETIME_MS = 15 * 60_000;

export function normalizeGuestPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  if (!/^\d{11,15}$/.test(normalized)) throw new Error('Invalid mobile number');
  return normalized;
}

function codeDigest(challengeId: string, code: string): string {
  const secret = process.env.CRM_OTP_SECRET;
  if (!secret || secret.length < 32) throw new Error('CRM phone verification is not configured');
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class PhoneVerificationService {
  async start(brandId: string, rawPhone: string): Promise<void> {
    const phone = normalizeGuestPhone(rawPhone);
    const recent = await prisma.customerPhoneVerification.findFirst({
      where: { brandId, phone, createdAt: { gte: new Date(Date.now() - 60_000) } },
      select: { id: true },
    });
    if (recent) return;
    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const templateName = process.env.WHATSAPP_AUTH_TEMPLATE_NAME;
    if (!templateName) throw new Error('WhatsApp authentication template is not configured');
    const provider = await new WhatsAppConnectionService().get(brandId);
    if (!provider) throw new Error('WhatsApp is not connected for this brand');
    await prisma.customerPhoneVerification.create({
      data: { id, brandId, phone, codeHash: codeDigest(id, code), expiresAt: new Date(Date.now() + CODE_LIFETIME_MS) },
    });
    try {
      await WhatsAppService.sendTemplateMessage(phone, templateName, provider.languageCode, [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
      ], provider);
    } catch (error) {
      await prisma.customerPhoneVerification.delete({ where: { id } });
      throw error;
    }
  }

  async verify(brandId: string, rawPhone: string, code: string): Promise<string | null> {
    const phone = normalizeGuestPhone(rawPhone);
    const challenge = await prisma.customerPhoneVerification.findFirst({
      where: { brandId, phone, verifiedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || !/^\d{6}$/.test(code)) return null;
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(codeDigest(challenge.id, code), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      await prisma.customerPhoneVerification.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      return null;
    }
    const token = randomBytes(32).toString('base64url');
    const claimed = await prisma.customerPhoneVerification.updateMany({
      where: { id: challenge.id, verifiedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
      data: { verifiedAt: new Date(), tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) },
    });
    if (claimed.count !== 1) return null;
    await prisma.customer.updateMany({
      where: { brandId, phone, crmGeneration: 2 }, data: { phoneVerifiedAt: new Date() },
    });
    return token;
  }

  async hasSession(brandId: string, rawPhone: string, token: string | undefined): Promise<boolean> {
    if (!token || token.length < 32) return false;
    const phone = normalizeGuestPhone(rawPhone);
    const session = await prisma.customerPhoneVerification.findFirst({
      where: { brandId, phone, tokenHash: tokenDigest(token), verifiedAt: { not: null }, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return Boolean(session);
  }
}
