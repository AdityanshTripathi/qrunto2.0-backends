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
    if (data.segmentId) {
      const segment = await prisma.segment.findFirst({
        where: {
          id: data.segmentId,
          brandId,
        },
        select: { id: true },
      });

      if (!segment) {
        throw new Error('Segment not found or unauthorized');
      }
    }

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
      where: { id: campaignId, brandId },
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
      where: { id: campaignId, brandId },
      data: { status: CampaignStatus.SENDING },
    });

    try {
      // 2. Fetch targets
      let targetCustomers: any[] = [];
      if (campaign.segmentId) {
        const memberships = await prisma.customerSegment.findMany({
          where: {
            segmentId: campaign.segmentId,
            customer: { brandId },
          },
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
          where: { id: campaignId, brandId },
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
          // No delivery provider is connected. Never record simulated delivery as SENT.
          await Promise.reject(new Error('Campaign delivery provider is not configured'));

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
          where: { id: campaignId, brandId },
          data: { sentCount, failedCount },
        });
      }

      // 5. Complete campaign
      await prisma.campaign.update({
        where: { id: campaignId, brandId },
        data: { status: failedCount > 0 && sentCount === 0 ? CampaignStatus.FAILED : CampaignStatus.COMPLETED },
      });

      console.log(`[Campaign Dispatcher] Campaign "${campaign.name}" completed. Sent: ${sentCount}, Failed: ${failedCount}`);
    } catch (err: any) {
      logSafeError('campaign.execution', err);
      await prisma.campaign.update({
        where: { id: campaignId, brandId },
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
