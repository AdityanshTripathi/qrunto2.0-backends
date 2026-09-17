import { prisma } from '../../lib/prisma';

export const CRM_NOTICE_VERSION = 'crm-dine-in-v1';

/** Consent is an append-only decision log. The most recent decision wins. */
export class ConsentService {
  async recordWhatsAppMarketing(customerId: string, granted: boolean, source: string) {
    return prisma.customerConsent.upsert({
      where: {
        customerId_channel_purpose_source: {
          customerId, channel: 'WHATSAPP', purpose: 'MARKETING', source,
        },
      },
      update: {},
      create: {
        customerId, channel: 'WHATSAPP', purpose: 'MARKETING',
        granted, source, noticeVersion: CRM_NOTICE_VERSION,
      },
    });
  }

  async canSendWhatsAppMarketing(customerId: string): Promise<boolean> {
    const latest = await prisma.customerConsent.findFirst({
      where: { customerId, channel: 'WHATSAPP', purpose: 'MARKETING' },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      select: { granted: true },
    });
    return latest?.granted === true;
  }
}
