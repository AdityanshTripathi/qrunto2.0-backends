import { prisma } from '../../lib/prisma';
import { logSafeError, safeError } from '../../lib/safe-error';
import { CampaignChannel, CampaignStatus, CampaignLogStatus } from '@prisma/client';

export interface CreateCampaignInput {
  name: string;
  channel: CampaignChannel;
  segmentId?: string | null | undefined;
  templateSubject?: string | null | undefined;
  templateBody: string;
  scheduledAt: Date;
}

export class CampaignService {
  // Create a new messaging campaign
  async createCampaign(brandId: string, data: CreateCampaignInput): Promise<any> {
    return prisma.campaign.create({
      data: {
        brandId,
        name: data.name,
        channel: data.channel,
        segmentId: data.segmentId ?? null,
        templateSubject: data.templateSubject ?? null,
        templateBody: data.templateBody,
        status: CampaignStatus.QUEUED, // auto-queue upon creation
        scheduledAt: data.scheduledAt,
      },
    });
  }

  // Get campaigns list for brand
  async getCampaigns(brandId: string): Promise<any[]> {
    return prisma.campaign.findMany({
      where: { brandId },
      include: {
        segment: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Delete campaign
  async deleteCampaign(brandId: string, campaignId: string): Promise<void> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, brandId },
    });

    if (!campaign) {
      throw new Error('Campaign not found or unauthorized');
    }

    await prisma.campaign.delete({
      where: { id: campaignId },
    });
  }

  // Process and dispatch a campaign asynchronously
  async sendCampaign(campaignId: string, brandId: string): Promise<void> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, brandId, status: CampaignStatus.QUEUED },
    });

    if (!campaign) return;

    // 1. Mark campaign as SENDING
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.SENDING },
    });

    try {
      // 2. Fetch targets
      let targetCustomers: any[] = [];
      if (campaign.segmentId) {
        const memberships = await prisma.customerSegment.findMany({
          where: { segmentId: campaign.segmentId },
          include: { customer: true },
        });
        targetCustomers = memberships.map((m) => m.customer);
      } else {
        targetCustomers = await prisma.customer.findMany({
          where: { brandId },
        });
      }

      if (targetCustomers.length === 0) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.COMPLETED },
        });
        return;
      }

      console.log(`[Campaign Dispatcher] Starting Campaign "${campaign.name}" (${campaign.id}). Targets: ${targetCustomers.length}`);

      // 3. Create pending logs
      await prisma.campaignLog.createMany({
        data: targetCustomers.map((c) => ({
          campaignId,
          customerId: c.id,
          status: CampaignLogStatus.PENDING,
        })),
      });

      // 4. Dispatch async (evaluate customer by customer)
      let sentCount = 0;
      let failedCount = 0;

      for (const customer of targetCustomers) {
        try {
          // Token substitution
          const interpolatedBody = campaign.templateBody
            .replace(/\{\{name\}\}/gi, customer.name || 'Valued Guest')
            .replace(/\{\{phone\}\}/gi, customer.phone || '')
            .replace(/\{\{email\}\}/gi, customer.email || '');

          // Simulate dispatch based on channel type
          if (campaign.channel === CampaignChannel.EMAIL) {
            if (!customer.email) {
              throw new Error('Customer does not have a linked email address');
            }
            console.log(`[SMTP Mailer Simulator] To: ${customer.email} | Sub: ${campaign.templateSubject} | Msg: ${interpolatedBody}`);
          } else if (campaign.channel === CampaignChannel.SMS) {
            console.log(`[SMS Gateway Simulator] To: ${customer.phone} | Msg: ${interpolatedBody}`);
          }

          // Mark log as SENT
          await prisma.campaignLog.updateMany({
            where: { campaignId, customerId: customer.id },
            data: { status: CampaignLogStatus.SENT },
          });
          sentCount++;
        } catch (err: any) {
          logSafeError('campaign.customer.dispatch', err);
          
          // Mark log as FAILED
          await prisma.campaignLog.updateMany({
            where: { campaignId, customerId: customer.id },
            data: {
              status: CampaignLogStatus.FAILED,
              errorDetails: safeError(err).message,
            },
          });
          failedCount++;
        }

        // Periodically update campaign progress counts
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { sentCount, failedCount },
        });
      }

      // 5. Complete campaign
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.COMPLETED },
      });

      console.log(`[Campaign Dispatcher] Campaign "${campaign.name}" completed. Sent: ${sentCount}, Failed: ${failedCount}`);
    } catch (err: any) {
      logSafeError('campaign.execution', err);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });
    }
  }

  // Find and process queued campaigns due for sending
  async processQueuedCampaigns(): Promise<void> {
    const now = new Date();
    const queuedCampaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.QUEUED,
        scheduledAt: { lte: now },
      },
    });

    for (const campaign of queuedCampaigns) {
      // Keep dispatch inside the scheduler invocation's lifetime.
      await this.sendCampaign(campaign.id, campaign.brandId);
    }
  }

  // Fetch campaign logs metrics
  async getCampaignLogs(campaignId: string, brandId: string): Promise<any[]> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, brandId },
    });

    if (!campaign) {
      throw new Error('Campaign not found or unauthorized');
    }

    return prisma.campaignLog.findMany({
      where: { campaignId },
      include: {
        customer: { select: { name: true, phone: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
