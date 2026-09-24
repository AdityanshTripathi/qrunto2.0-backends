import { prisma } from '../../lib/prisma';
import { logSafeError, logStructured, safeError } from '../../lib/safe-error';
import { createHash } from 'node:crypto';
import { CampaignChannel, CampaignStatus, CampaignLogStatus, Prisma } from '@prisma/client';
import { ConsentService } from './consent.service';
import { WhatsAppProviderOutcomeUncertainError, WhatsAppService } from '../whatsapp.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import {
  buildTemplateComponents,
  WhatsAppTemplateValidationService,
} from './whatsapp-template-validation.service';

export interface CreateCampaignInput {
  name: string;
  channel: CampaignChannel;
  segmentId?: string | null | undefined;
  templateSubject?: string | null | undefined;
  templateBody: string;
  whatsappTemplateId: string;
  whatsappTemplateLanguage: string;
  whatsappTemplateCategory: string;
  whatsappTemplateParameters: Record<string, string>;
  scheduledAt: Date;
}

export type UpdateCampaignInput = Partial<CreateCampaignInput>;

export class CampaignIdempotencyConflictError extends Error {
  readonly code = 'CAMPAIGN_IDEMPOTENCY_CONFLICT';
  constructor() { super('Idempotency key was already used with a different campaign request'); }
}

type CampaignDb = Prisma.TransactionClient | typeof prisma;

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

function withoutInternalConnectionVersion<T extends { whatsappConnectionVersion?: unknown }>(campaign: T): Omit<T, 'whatsappConnectionVersion'> {
  const { whatsappConnectionVersion: _internal, ...publicCampaign } = campaign;
  return publicCampaign;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function campaignPayloadHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function webhookTransition(
  current: CampaignLogStatus | string,
  incoming: CampaignLogStatus | string,
  campaignCancelled: boolean,
): CampaignLogStatus | null {
  if (current === CampaignLogStatus.CANCELLED || current === CampaignLogStatus.PERMANENTLY_INELIGIBLE ||
      current === CampaignLogStatus.EXHAUSTED) return null;
  if (!([CampaignLogStatus.SENT, CampaignLogStatus.DELIVERED, CampaignLogStatus.READ, CampaignLogStatus.FAILED] as CampaignLogStatus[]).includes(incoming as CampaignLogStatus)) return null;
  if (campaignCancelled && current !== CampaignLogStatus.PENDING_RECONCILIATION) return null;
  if (incoming === CampaignLogStatus.FAILED) {
    return ([CampaignLogStatus.PENDING, CampaignLogStatus.DISPATCHING, CampaignLogStatus.PENDING_RECONCILIATION, CampaignLogStatus.FAILED] as CampaignLogStatus[])
      .includes(current as CampaignLogStatus) ? CampaignLogStatus.FAILED : null;
  }
  const rank: Partial<Record<CampaignLogStatus, number>> = {
    [CampaignLogStatus.PENDING]: 0,
    [CampaignLogStatus.DISPATCHING]: 0,
    [CampaignLogStatus.PENDING_RECONCILIATION]: 0,
    [CampaignLogStatus.FAILED]: 0,
    [CampaignLogStatus.SENT]: 1,
    [CampaignLogStatus.DELIVERED]: 2,
    [CampaignLogStatus.READ]: 3,
  };
  return (rank[incoming as CampaignLogStatus] ?? -1) > (rank[current as CampaignLogStatus] ?? -1)
    ? incoming as CampaignLogStatus : null;
}

export class CampaignService {
  constructor(private readonly templateValidation = new WhatsAppTemplateValidationService()) {}

  private async validateSegment(db: CampaignDb, brandId: string, segmentId: string | null | undefined): Promise<void> {
    if (!segmentId) return;
    const segment = await db.segment.findFirst({
      where: { id: segmentId, brandId, crmGeneration: 2 }, select: { id: true },
    });
    if (!segment) throw new Error('Segment not found or unauthorized');
  }

  private draftData(brandId: string, data: CreateCampaignInput) {
    return {
      brandId, crmGeneration: 2, name: data.name, channel: data.channel, segmentId: data.segmentId ?? null,
      templateSubject: data.templateSubject ?? null, templateBody: data.templateBody,
      whatsappTemplateId: data.whatsappTemplateId,
      whatsappTemplateLanguage: data.whatsappTemplateLanguage,
      whatsappTemplateCategory: data.whatsappTemplateCategory,
      whatsappTemplateParameters: data.whatsappTemplateParameters,
      whatsappConnectionVersion: null,
      status: CampaignStatus.DRAFT,
      scheduledAt: data.scheduledAt,
    };
  }

  private async existingRequest(brandId: string, operation: string, key: string, hash: string): Promise<any | null> {
    const existing = await prisma.campaignRequest.findUnique({
      where: { brandId_operation_key: { brandId, operation, key } },
    });
    if (!existing) return null;
    if (existing.payloadHash !== hash) throw new CampaignIdempotencyConflictError();
    if (!existing.campaignId) throw Object.assign(new Error('Campaign request is still in progress'), { code: 'CAMPAIGN_IDEMPOTENCY_IN_PROGRESS' });
    const campaign = await prisma.campaign.findFirst({ where: { id: existing.campaignId, brandId, crmGeneration: 2 } });
    if (!campaign) throw new Error('Idempotent campaign result is unavailable');
    return campaign;
  }

  async createCampaign(brandId: string, data: CreateCampaignInput, idempotencyKey?: string): Promise<any> {
    const create = async (db: CampaignDb) => {
      await this.validateSegment(db, brandId, data.segmentId);
      return db.campaign.create({ data: this.draftData(brandId, data) });
    };
    if (!idempotencyKey) return withoutInternalConnectionVersion(await create(prisma));
    const operation = 'CREATE';
    const hash = campaignPayloadHash(data);
    const prior = await this.existingRequest(brandId, operation, idempotencyKey, hash);
    if (prior) return withoutInternalConnectionVersion(prior);
    try {
      const campaign = await prisma.$transaction(async tx => {
        const saved = await create(tx);
        await tx.campaignRequest.create({ data: {
          brandId, operation, key: idempotencyKey, payloadHash: hash, campaignId: saved.id,
        } });
        return saved;
      });
      return withoutInternalConnectionVersion(campaign);
    } catch (error) {
      if ((error as { code?: unknown })?.code !== 'P2002') throw error;
      const existing = await this.existingRequest(brandId, operation, idempotencyKey, hash);
      if (!existing) throw error;
      return withoutInternalConnectionVersion(existing);
    }
  }

  async updateDraft(brandId: string, campaignId: string, data: UpdateCampaignInput): Promise<any | null> {
    if (data.segmentId !== undefined) await this.validateSegment(prisma, brandId, data.segmentId);
    const fields = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    const result = await prisma.campaign.updateMany({
      where: { id: campaignId, brandId, crmGeneration: 2, status: CampaignStatus.DRAFT },
      data: { ...fields, whatsappConnectionVersion: null },
    });
    if (result.count !== 1) return null;
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, brandId, crmGeneration: 2 } });
    return campaign ? withoutInternalConnectionVersion(campaign) : null;
  }

  async queueDraft(brandId: string, campaignId: string, idempotencyKey?: string): Promise<boolean> {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, brandId, crmGeneration: 2, channel: CampaignChannel.WHATSAPP, status: CampaignStatus.DRAFT },
    });
    if (!campaign) {
      if (!idempotencyKey) return false;
      const existing = await this.existingRequest(brandId, 'QUEUE', idempotencyKey, campaignPayloadHash({ campaignId }));
      return existing?.id === campaignId;
    }
    let verified: Awaited<ReturnType<WhatsAppTemplateValidationService['prepareNew']>>;
    try { verified = await this.templateValidation.prepareNew(brandId, campaign); } catch { return false; }
    const operation = 'QUEUE';
    const hash = campaignPayloadHash({ campaignId });
    const queue = async (db: CampaignDb): Promise<boolean> => {
      const current = await db.campaign.findFirst({
        where: { id: campaignId, brandId, crmGeneration: 2, channel: CampaignChannel.WHATSAPP, status: CampaignStatus.DRAFT },
      });
      if (!current) return false;
      const targets = current.segmentId
        ? (await db.customerSegment.findMany({
            where: { segmentId: current.segmentId, customer: { brandId, crmGeneration: 2 } }, select: { customerId: true },
          })).map(row => row.customerId)
        : (await db.customer.findMany({ where: { brandId, crmGeneration: 2 }, select: { id: true } })).map(row => row.id);
      if (targets.length) await db.campaignLog.createMany({
        data: targets.map(customerId => ({ campaignId, customerId, status: CampaignLogStatus.PENDING })), skipDuplicates: true,
      });
      const updated = await db.campaign.updateMany({
        where: { id: campaignId, brandId, crmGeneration: 2, status: CampaignStatus.DRAFT },
        data: {
          status: CampaignStatus.QUEUED,
          templateBody: verified.template.templateName,
          whatsappTemplateId: verified.template.id,
          whatsappTemplateLanguage: verified.template.languageCode,
          whatsappTemplateCategory: verified.template.category,
          whatsappTemplateParameters: verified.parameterValues,
          whatsappConnectionVersion: verified.connectionVersion,
        },
      });
      return updated.count === 1;
    };
    if (!idempotencyKey) return prisma.$transaction(queue);
    const prior = await this.existingRequest(brandId, operation, idempotencyKey, hash);
    if (prior) return prior.id === campaignId;
    try {
      return await prisma.$transaction(async tx => {
        const queued = await queue(tx);
        if (!queued) {
          // A concurrent request may have queued this draft and committed the
          // durable request record while this transaction was waiting.
          const existing = await tx.campaignRequest.findUnique({
            where: { brandId_operation_key: { brandId, operation, key: idempotencyKey } },
          });
          if (!existing) return false;
          if (existing.payloadHash !== hash) throw new CampaignIdempotencyConflictError();
          return existing.campaignId === campaignId;
        }
        await tx.campaignRequest.create({ data: { brandId, operation, key: idempotencyKey, payloadHash: hash, campaignId } });
        return true;
      });
    } catch (error) {
      if ((error as { code?: unknown })?.code !== 'P2002') throw error;
      const existing = await this.existingRequest(brandId, operation, idempotencyKey, hash);
      return existing?.id === campaignId;
    }
  }

  async getCampaigns(brandId: string, page: CursorPage): Promise<{ campaigns: any[]; pagination: PageInfo }> {
    const rows = await prisma.campaign.findMany({
      where: { brandId, crmGeneration: 2 }, include: { segment: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > page.limit;
    const campaigns = (hasMore ? rows.slice(0, page.limit) : rows).map(withoutInternalConnectionVersion);
    return {
      campaigns,
      pagination: {
        limit: page.limit,
        nextCursor: hasMore ? campaigns[campaigns.length - 1]?.id ?? null : null,
        hasMore,
      },
    };
  }

  async cancelCampaign(brandId: string, campaignId: string): Promise<boolean> {
    const campaign = await prisma.campaign.updateMany({
      where: {
        id: campaignId, brandId, crmGeneration: 2,
        status: { in: [CampaignStatus.DRAFT, CampaignStatus.QUEUED, CampaignStatus.FAILED, CampaignStatus.SENDING] },
      },
      data: { status: CampaignStatus.CANCELLED },
    });
    if (campaign.count !== 1) return false;
    await prisma.campaignLog.updateMany({
      where: { campaignId, status: { in: [CampaignLogStatus.PENDING, CampaignLogStatus.FAILED] } },
      data: { status: CampaignLogStatus.CANCELLED, errorDetails: 'Campaign cancelled before provider dispatch.' },
    });
    await prisma.campaignLog.updateMany({
      where: {
        campaignId,
        status: CampaignLogStatus.DISPATCHING,
        providerDispatchStartedAt: null,
      },
      data: { status: CampaignLogStatus.CANCELLED, errorDetails: 'Campaign cancelled before provider dispatch.' },
    });
    // A confirmed provider acceptance remains SENT. A durable dispatch marker
    // means cancellation raced a request that may already reach Meta, so its
    // outcome is reconciled rather than guessed or automatically retried.
    await prisma.campaignLog.updateMany({
      where: {
        campaignId,
        status: CampaignLogStatus.DISPATCHING,
        providerDispatchStartedAt: { not: null },
      },
      data: { status: CampaignLogStatus.PENDING_RECONCILIATION, errorDetails: 'Campaign cancelled while provider outcome was not final.' },
    });
    return true;
  }

  async deleteCampaign(brandId: string, campaignId: string): Promise<void> {
    if (!await this.cancelCampaign(brandId, campaignId)) throw new Error('Campaign not found, terminal, or unauthorized');
  }

  protected async deliverRecipient(input: {
    idempotencyKey: string; campaignId: string; customerId: string; brandId: string;
  }): Promise<void> {
    const [campaign, customer] = await Promise.all([
      // Cancellation moves a claimed campaign out of SENDING before this point.
      // Never start a provider request once that state transition is visible.
      prisma.campaign.findFirst({ where: {
        id: input.campaignId, brandId: input.brandId, crmGeneration: 2, status: CampaignStatus.SENDING,
      } }),
      prisma.customer.findFirst({ where: { id: input.customerId, brandId: input.brandId, crmGeneration: 2 } }),
    ]);
    if (!campaign || !customer || campaign.channel !== 'WHATSAPP' || !customer.phoneVerifiedAt) {
      throw new Error('Recipient or WhatsApp campaign is not eligible');
    }
    if (!await new ConsentService().canSendWhatsAppMarketing(customer.id)) {
      throw new Error('WhatsApp marketing consent is unavailable or withdrawn');
    }
    const verified = await this.templateValidation.validate(input.brandId, campaign);
    const components = buildTemplateComponents(verified.schema, verified.parameterValues);
    await new WhatsAppConnectionService().assertCurrentVerified(input.brandId, verified.current);
    // Atomically record the irreversible provider-dispatch boundary. Cancellation
    // can still stop an unmarked claim, but a marked request is reconciliation-only.
    const dispatchGate = await prisma.campaignLog.updateMany({
      where: {
        campaignId: input.campaignId,
        customerId: input.customerId,
        status: CampaignLogStatus.DISPATCHING,
        providerDispatchStartedAt: null,
        campaign: { brandId: input.brandId, crmGeneration: 2, status: CampaignStatus.SENDING },
      },
      data: { providerDispatchStartedAt: new Date() },
    });
    if (dispatchGate.count !== 1) throw new Error('Campaign was cancelled or recipient claim changed before provider dispatch');
    // Close the normal cancellation window after the durable gate. A cancellation
    // after this point has already marked the outcome for reconciliation.
    const stillDispatchable = await prisma.campaignLog.findFirst({
      where: {
        campaignId: input.campaignId,
        customerId: input.customerId,
        status: CampaignLogStatus.DISPATCHING,
        providerDispatchStartedAt: { not: null },
        campaign: { brandId: input.brandId, crmGeneration: 2, status: CampaignStatus.SENDING },
      },
      select: { id: true },
    });
    if (!stillDispatchable) throw new Error('Campaign was cancelled before provider dispatch');
    let result: any;
    try {
      result = await WhatsAppService.sendTemplateMessage(
        customer.phone, verified.template.templateName, verified.template.languageCode, components,
        { phoneNumberId: verified.current.phoneNumberId, accessToken: verified.current.accessToken },
      );
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (code === 'HTTP_401' || code === 'HTTP_403') {
        await new WhatsAppConnectionService().markNeedsReauth(input.brandId, verified.current, 'META_AUTHENTICATION_FAILED');
      }
      throw error;
    }
    const providerMessageId = result?.messages?.[0]?.id;
    if (typeof providerMessageId !== 'string') throw new WhatsAppProviderOutcomeUncertainError();
    try {
      const stored = await prisma.campaignLog.updateMany({
        where: { campaignId: campaign.id, customerId: customer.id, status: CampaignLogStatus.DISPATCHING },
        data: { providerMessageId },
      });
      if (stored.count !== 1) throw new Error('Campaign recipient claim changed before provider acknowledgement was recorded');
    } catch { throw new WhatsAppProviderOutcomeUncertainError(); }
  }

  async sendCampaign(campaignId: string, brandId: string): Promise<boolean> {
    // Atomic claim: COMPLETED and exhausted campaigns can never be re-dispatched.
    const claim = await prisma.campaign.updateMany({
      where: {
        id: campaignId, brandId, crmGeneration: 2,
        status: { in: [CampaignStatus.QUEUED, CampaignStatus.FAILED] },
        attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
      },
      data: { status: CampaignStatus.SENDING, attemptCount: { increment: 1 } },
    });
    if (claim.count !== 1) return true;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, brandId, crmGeneration: 2, status: CampaignStatus.SENDING },
    });
    if (!campaign) throw new Error('Claimed campaign not found');

    try {
      await this.templateValidation.validate(brandId, campaign);
    } catch (error) {
      logSafeError('campaign.template.validation', error, 'crm', { campaignId, brandId });
      await prisma.campaign.updateMany({
        where: { id: campaignId, brandId, status: CampaignStatus.SENDING },
        data: { status: CampaignStatus.FAILED },
      });
      return false;
    }

    try {
      const logs = await prisma.campaignLog.findMany({
        where: { campaignId }, select: { customerId: true, status: true, attemptCount: true },
      });
      if (logs.length === 0) {
        await prisma.campaign.updateMany({
          where: { id: campaignId, brandId, status: CampaignStatus.SENDING },
          data: { status: CampaignStatus.COMPLETED, sentCount: 0, failedCount: 0 },
        });
        return true;
      }

      logStructured('info', 'crm', 'campaign.dispatch', 'started', 'Campaign dispatch started',
        { campaignId, brandId, targetCount: logs.length, attempt: campaign.attemptCount });

      let sentCount = 0;
      let failedCount = 0;

      for (const log of logs) {
        if (log.status === CampaignLogStatus.SENT ||
            log.status === CampaignLogStatus.DELIVERED ||
            log.status === CampaignLogStatus.READ) {
          sentCount++;
          continue;
        }
        if (([CampaignLogStatus.PENDING_RECONCILIATION, CampaignLogStatus.PERMANENTLY_INELIGIBLE,
             CampaignLogStatus.CANCELLED, CampaignLogStatus.EXHAUSTED] as CampaignLogStatus[]).includes(log.status)) {
          failedCount++;
          continue;
        }
        const customer = await prisma.customer.findFirst({
          where: { id: log.customerId, brandId, crmGeneration: 2 },
          select: { id: true, phone: true, phoneVerifiedAt: true },
        });
        const eligible = Boolean(customer?.phone && customer.phoneVerifiedAt) &&
          await new ConsentService().canSendWhatsAppMarketing(log.customerId);
        if (!eligible) {
          await prisma.campaignLog.updateMany({
            where: { campaignId, customerId: log.customerId, status: { in: [CampaignLogStatus.PENDING, CampaignLogStatus.FAILED] } },
            data: { status: CampaignLogStatus.PERMANENTLY_INELIGIBLE, errorDetails: 'Recipient is no longer eligible for WhatsApp marketing.' },
          });
          failedCount++;
          continue;
        }
        if (log.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
          await prisma.campaignLog.updateMany({
            where: { campaignId, customerId: log.customerId, status: { in: [CampaignLogStatus.PENDING, CampaignLogStatus.FAILED] } },
            data: { status: CampaignLogStatus.EXHAUSTED, errorDetails: 'Recipient delivery attempts exhausted.' },
          });
          failedCount++;
          continue;
        }

        const nextAttempt = log.attemptCount + 1;
        const recipientClaim = await prisma.campaignLog.updateMany({
          where: {
            campaignId, customerId: log.customerId,
            status: { in: [CampaignLogStatus.PENDING, CampaignLogStatus.FAILED] },
            attemptCount: log.attemptCount,
          },
          data: {
            status: CampaignLogStatus.DISPATCHING, attemptCount: { increment: 1 },
            lastAttemptAt: new Date(), errorDetails: null,
          },
        });
        if (recipientClaim.count !== 1) {
          failedCount++;
          continue;
        }

        try {
          await this.deliverRecipient({
            idempotencyKey: `campaign:${campaignId}:customer:${log.customerId}`,
            campaignId, customerId: log.customerId, brandId,
          });
          await prisma.campaignLog.updateMany({
            where: {
              campaignId, customerId: log.customerId,
              status: CampaignLogStatus.DISPATCHING, attemptCount: nextAttempt,
            },
            data: { status: CampaignLogStatus.SENT, errorDetails: null },
          });
          sentCount++;
        } catch (error) {
          logSafeError('campaign.customer.dispatch', error, 'crm',
            { campaignId, brandId, customerId: log.customerId, attempt: nextAttempt });
          const uncertain = error instanceof WhatsAppProviderOutcomeUncertainError ||
            (error as { code?: unknown })?.code === 'WHATSAPP_PROVIDER_OUTCOME_UNCERTAIN';
          await prisma.campaignLog.updateMany({
            where: {
              campaignId, customerId: log.customerId,
              status: CampaignLogStatus.DISPATCHING, attemptCount: nextAttempt,
            },
            data: {
              status: uncertain ? CampaignLogStatus.PENDING_RECONCILIATION :
                nextAttempt >= MAX_DELIVERY_ATTEMPTS ? CampaignLogStatus.EXHAUSTED : CampaignLogStatus.FAILED,
              errorDetails: uncertain ? 'Provider outcome requires reconciliation before any retry.' : safeError(error).message,
            },
          });
          failedCount++;
        }
      }

      const completed = failedCount === 0;
      await prisma.campaign.updateMany({
        where: { id: campaignId, brandId, status: CampaignStatus.SENDING },
        data: {
          status: completed ? CampaignStatus.COMPLETED :
            campaign.attemptCount >= MAX_DELIVERY_ATTEMPTS ? CampaignStatus.EXHAUSTED : CampaignStatus.FAILED,
          sentCount, failedCount,
        },
      });
      logStructured(completed ? 'info' : 'warn', 'crm', 'campaign.dispatch',
        completed ? 'completed' : 'partial', 'Campaign dispatch finished',
        { campaignId, brandId, targetCount: logs.length, sentCount, failedCount, attempt: campaign.attemptCount });
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

  async recoverStaleCampaignWork(now = new Date()): Promise<void> {
    const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
    // A terminated invocation can leave an accepted provider request unresolved.
    await prisma.campaignLog.updateMany({
      where: {
        status: CampaignLogStatus.DISPATCHING,
        campaign: { crmGeneration: 2, status: CampaignStatus.SENDING, updatedAt: { lte: staleBefore } },
      },
      data: {
        status: CampaignLogStatus.PENDING_RECONCILIATION,
        errorDetails: 'Worker stopped while provider outcome was unknown; automatic retry is blocked.',
      },
    });
    await prisma.campaign.updateMany({
      where: {
        crmGeneration: 2, status: CampaignStatus.SENDING,
        attemptCount: { lt: MAX_DELIVERY_ATTEMPTS }, updatedAt: { lte: staleBefore },
      },
      data: { status: CampaignStatus.FAILED },
    });
    await prisma.campaign.updateMany({
      where: {
        crmGeneration: 2, status: { in: [CampaignStatus.SENDING, CampaignStatus.FAILED] },
        attemptCount: { gte: MAX_DELIVERY_ATTEMPTS },
        OR: [{ status: CampaignStatus.FAILED }, { updatedAt: { lte: staleBefore } }],
      },
      data: { status: CampaignStatus.EXHAUSTED },
    });
    await prisma.campaignLog.updateMany({
      where: {
        status: CampaignLogStatus.FAILED, attemptCount: { gte: MAX_DELIVERY_ATTEMPTS },
        campaign: { crmGeneration: 2, status: CampaignStatus.EXHAUSTED },
      },
      data: { status: CampaignLogStatus.EXHAUSTED, errorDetails: 'Recipient delivery attempts exhausted.' },
    });
  }

  async processQueuedCampaigns(): Promise<{ processed: number; failed: number }> {
    const now = new Date();
    await this.recoverStaleCampaignWork(now);
    const campaigns = await prisma.campaign.findMany({
      where: {
        crmGeneration: 2, status: { in: [CampaignStatus.QUEUED, CampaignStatus.FAILED] },
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

  async applyWebhookStatus(
    providerMessageId: string,
    incoming: CampaignLogStatus,
    senderPhoneNumberId?: string,
  ): Promise<boolean> {
    const sender = senderPhoneNumberId
      ? await prisma.brandWhatsAppConnection.findUnique({ where: { phoneNumberId: senderPhoneNumberId }, select: { brandId: true } })
      : null;
    if (senderPhoneNumberId && !sender) return false;
    const log = await prisma.campaignLog.findFirst({
      where: {
        providerMessageId,
        ...(sender ? { campaign: { brandId: sender.brandId, crmGeneration: 2 } } : {}),
      },
      select: { id: true, status: true, campaign: { select: { status: true, brandId: true } } },
    });
    if (!log || (sender && log.campaign.brandId !== sender.brandId)) return false;
    const next = webhookTransition(log.status, incoming, log.campaign.status === CampaignStatus.CANCELLED);
    if (!next) return false;
    const changed = await prisma.campaignLog.updateMany({
      where: { id: log.id, providerMessageId, status: log.status },
      data: {
        status: next,
        ...(next === CampaignLogStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
        ...(next === CampaignLogStatus.READ ? { readAt: new Date() } : {}),
      },
    });
    return changed.count === 1;
  }

  async getCampaignLogs(
    campaignId: string,
    brandId: string,
    page: CursorPage,
  ): Promise<{ logs: any[]; pagination: PageInfo }> {
    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, brandId, crmGeneration: 2 } });
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
