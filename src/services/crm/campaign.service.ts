import { prisma } from '../../lib/prisma';
import { logSafeError, logStructured, safeError } from '../../lib/safe-error';
import { CampaignChannel, CampaignStatus, CampaignLogStatus } from '@prisma/client';

export interface CreateCampaignInput {
  name: string;
  channel: CampaignChannel;
  segmentId?: string | null | undefined;
  templateSubject?: string | null | undefined;
  templateBody: string;
  scheduledAt: Date;
}

const MAX_DELIVERY_ATTEMPTS = 3;
const STALE_SENDING_MS = 10 * 60 * 1000;
const CAMPAIGN_BATCH_SIZE = 50;

interface CursorPage {
  cursor?: string;
  limit: number;
}

interface PageInfo {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export class CampaignService {
  async createCampaign(brandId: string, data: CreateCampaignInput): Promise<any> {
    if (data.segmentId) {
      const segment = await prisma.segment.findFirst({
        where: { id: data.segmentId, brandId }, select: { id: true },
      });
      if (!segment) throw new Error('Segment not found or unauthorized');
    }
    return prisma.campaign.create({ data: {
      brandId, name: data.name, channel: data.channel, segmentId: data.segmentId ?? null,
      templateSubject: data.templateSubject ?? null, templateBody: data.templateBody,
      status: CampaignStatus.QUEUED, scheduledAt: data.scheduledAt,
    } });
  }

  async getCampaigns(brandId: string, page: CursorPage): Promise<{ campaigns: any[]; pagination: PageInfo }> {
    const rows = await prisma.campaign.findMany({
      where: { brandId }, include: { segment: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > page.limit;
    const campaigns = hasMore ? rows.slice(0, page.limit) : rows;
    return {
      campaigns,
      pagination: {
        limit: page.limit,
        nextCursor: hasMore ? campaigns[campaigns.length - 1]?.id ?? null : null,
        hasMore,
      },
    };
  }

  async deleteCampaign(brandId: string, campaignId: string): Promise<void> {
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, brandId } });
    if (!campaign) throw new Error('Campaign not found or unauthorized');
    await prisma.campaign.delete({ where: { id: campaignId, brandId } });
  }

  // Provider integration remains intentionally absent. A future provider must use
  // this deterministic key as its idempotency key before reporting success.
  protected async deliverRecipient(_input: {
    idempotencyKey: string; campaignId: string; customerId: string; brandId: string;
  }): Promise<void> {
    throw new Error('Campaign delivery provider is not configured');
  }

  async sendCampaign(campaignId: string, brandId: string): Promise<boolean> {
    // Atomic claim: COMPLETED and exhausted campaigns can never be re-dispatched.
    const claim = await prisma.campaign.updateMany({
      where: {
        id: campaignId, brandId,
        status: { in: [CampaignStatus.QUEUED, CampaignStatus.FAILED] },
        attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
      },
      data: { status: CampaignStatus.SENDING, attemptCount: { increment: 1 } },
    });
    if (claim.count !== 1) return true;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, brandId, status: CampaignStatus.SENDING },
    });
    if (!campaign) throw new Error('Claimed campaign not found');

    try {
      let targets: Array<{ id: string }>;
      if (campaign.segmentId) {
        const memberships = await prisma.customerSegment.findMany({
          where: { segmentId: campaign.segmentId, customer: { brandId } },
          include: { customer: true },
        });
        targets = memberships.map(membership => membership.customer);
      } else {
        targets = await prisma.customer.findMany({ where: { brandId }, select: { id: true } });
      }

      if (targets.length === 0) {
        await prisma.campaign.updateMany({
          where: { id: campaignId, brandId, status: CampaignStatus.SENDING },
          data: { status: CampaignStatus.COMPLETED, sentCount: 0, failedCount: 0 },
        });
        return true;
      }

      logStructured('info', 'crm', 'campaign.dispatch', 'started', 'Campaign dispatch started',
        { campaignId, brandId, targetCount: targets.length, attempt: campaign.attemptCount });

      await prisma.campaignLog.createMany({
        data: targets.map(customer => ({
          campaignId, customerId: customer.id, status: CampaignLogStatus.PENDING,
        })),
        skipDuplicates: true,
      });
      const logs = await prisma.campaignLog.findMany({
        where: { campaignId, customerId: { in: targets.map(customer => customer.id) } },
        select: { customerId: true, status: true, attemptCount: true },
      });
      const byCustomer = new Map(logs.map(log => [log.customerId, log]));
      let sentCount = 0;
      let failedCount = 0;

      for (const customer of targets) {
        const log = byCustomer.get(customer.id);
        if (!log) {
          failedCount++;
          logSafeError('campaign.log.missing', new Error('Campaign recipient log missing'), 'crm',
            { campaignId, brandId, customerId: customer.id });
          continue;
        }
        if (log.status === CampaignLogStatus.SENT) {
          sentCount++;
          continue;
        }
        if (log.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
          failedCount++;
          continue;
        }

        const nextAttempt = log.attemptCount + 1;
        const recipientClaim = await prisma.campaignLog.updateMany({
          where: {
            campaignId, customerId: customer.id,
            status: { in: [CampaignLogStatus.PENDING, CampaignLogStatus.FAILED] },
            attemptCount: log.attemptCount,
          },
          data: {
            status: CampaignLogStatus.PENDING, attemptCount: { increment: 1 },
            lastAttemptAt: new Date(), errorDetails: null,
          },
        });
        if (recipientClaim.count !== 1) {
          failedCount++;
          continue;
        }

        try {
          await this.deliverRecipient({
            idempotencyKey: `campaign:${campaignId}:customer:${customer.id}`,
            campaignId, customerId: customer.id, brandId,
          });
          await prisma.campaignLog.updateMany({
            where: {
              campaignId, customerId: customer.id,
              status: CampaignLogStatus.PENDING, attemptCount: nextAttempt,
            },
            data: { status: CampaignLogStatus.SENT, errorDetails: null },
          });
          sentCount++;
        } catch (error) {
          logSafeError('campaign.customer.dispatch', error, 'crm',
            { campaignId, brandId, customerId: customer.id, attempt: nextAttempt });
          await prisma.campaignLog.updateMany({
            where: {
              campaignId, customerId: customer.id,
              status: CampaignLogStatus.PENDING, attemptCount: nextAttempt,
            },
            data: { status: CampaignLogStatus.FAILED, errorDetails: safeError(error).message },
          });
          failedCount++;
        }
      }

      const completed = failedCount === 0;
      await prisma.campaign.updateMany({
        where: { id: campaignId, brandId, status: CampaignStatus.SENDING },
        data: {
          status: completed ? CampaignStatus.COMPLETED : CampaignStatus.FAILED,
          sentCount, failedCount,
        },
      });
      logStructured(completed ? 'info' : 'warn', 'crm', 'campaign.dispatch',
        completed ? 'completed' : 'partial', 'Campaign dispatch finished',
        { campaignId, brandId, targetCount: targets.length, sentCount, failedCount, attempt: campaign.attemptCount });
      return completed;
    } catch (error) {
      logSafeError('campaign.execution', error, 'crm', { campaignId, brandId });
      await prisma.campaign.updateMany({
        where: { id: campaignId, brandId, status: CampaignStatus.SENDING },
        data: { status: CampaignStatus.FAILED },
      });
      return false;
    }
  }

  async processQueuedCampaigns(): Promise<{ processed: number; failed: number }> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
    // A terminated invocation can leave SENDING behind. Recover stale work only;
    // SENT recipient state and attempt counters make its retry safe and bounded.
    await prisma.campaign.updateMany({
      where: { status: CampaignStatus.SENDING, updatedAt: { lte: staleBefore } },
      data: { status: CampaignStatus.FAILED },
    });
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: { in: [CampaignStatus.QUEUED, CampaignStatus.FAILED] },
        attemptCount: { lt: MAX_DELIVERY_ATTEMPTS }, scheduledAt: { lte: now },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: CAMPAIGN_BATCH_SIZE,
    });

    let failed = 0;
    let firstError: unknown;
    for (const campaign of campaigns) {
      try {
        if (!await this.sendCampaign(campaign.id, campaign.brandId)) failed++;
      } catch (error) {
        failed++;
        firstError ??= error;
        logSafeError('campaign.batch.item', error, 'crm', { campaignId: campaign.id, brandId: campaign.brandId });
      }
    }
    logStructured(failed ? 'warn' : 'info', 'crm', 'campaign.batch',
      failed ? 'partial' : 'completed', 'Campaign batch finished',
      { processedCount: campaigns.length, failedCount: failed });
    if (failed > 0) {
      throw firstError ?? Object.assign(new Error('CRM campaign batch partially failed'), { code: 'CRM_PARTIAL_FAILURE' });
    }
    return { processed: campaigns.length, failed };
  }

  async getCampaignLogs(
    campaignId: string,
    brandId: string,
    page: CursorPage,
  ): Promise<{ logs: any[]; pagination: PageInfo }> {
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, brandId } });
    if (!campaign) throw new Error('Campaign not found or unauthorized');
    const rows = await prisma.campaignLog.findMany({
      where: { campaignId }, include: { customer: { select: { name: true, phone: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > page.limit;
    const logs = hasMore ? rows.slice(0, page.limit) : rows;
    return {
      logs,
      pagination: {
        limit: page.limit,
        nextCursor: hasMore ? logs[logs.length - 1]?.id ?? null : null,
        hasMore,
      },
    };
  }
}
