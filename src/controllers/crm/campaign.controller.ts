import { restaurantTimezone, localDateTime, BusinessDateError } from '../../lib/timezone';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';
import { CampaignIdempotencyConflictError, CampaignService, UpdateCampaignInput } from '../../services/crm/campaign.service';
import { z } from 'zod';
import { CampaignChannel } from '@prisma/client';

const TemplateFields = z.object({
  selectedTemplateId: z.string().uuid().optional(), templateLanguage: z.string().trim().min(1).max(35).optional(),
  templateCategory: z.string().trim().min(1).max(64).optional(), templateParameters: z.record(z.string(), z.string().min(1).max(1024)).optional(),
  whatsappTemplateId: z.string().uuid().optional(), whatsappTemplateLanguage: z.string().trim().min(1).max(35).optional(),
  whatsappTemplateCategory: z.string().trim().min(1).max(64).optional(), whatsappTemplateParameters: z.record(z.string(), z.string().min(1).max(1024)).optional(),
});
const BaseFields = z.object({
  name: z.string().min(2).max(50), channel: z.literal('WHATSAPP'), segmentId: z.string().uuid().optional().nullable(),
  templateSubject: z.string().max(100).optional().nullable(), templateBody: z.string().regex(/^[a-z0-9_]{3,100}$/).optional(),
  scheduledAt: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Invalid scheduled date'),
});

function compatibleTemplateFields(data: Record<string, any>, context: z.core.$RefinementCtx<Record<string, any>>, required: boolean): void {
  const pairs: Array<[unknown, unknown, string]> = [
    [data.selectedTemplateId, data.whatsappTemplateId, 'selectedTemplateId'],
    [data.templateLanguage, data.whatsappTemplateLanguage, 'templateLanguage'],
    [data.templateCategory, data.whatsappTemplateCategory, 'templateCategory'],
    [data.templateParameters, data.whatsappTemplateParameters, 'templateParameters'],
  ];
  for (const [modern, legacy, path] of pairs) {
    if (modern !== undefined && legacy !== undefined && JSON.stringify(modern) !== JSON.stringify(legacy)) {
      context.addIssue({ code: 'custom', path: [path], message: 'Conflicting legacy and current template fields' });
    }
    if (required && modern === undefined && legacy === undefined) context.addIssue({ code: 'custom', path: [path], message: 'Template field is required' });
  }
}

const CreateCampaignSchema = BaseFields.and(TemplateFields).and(z.object({
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
})).superRefine((data, context) => compatibleTemplateFields(data, context as any, true));
const PatchCampaignSchema = BaseFields.partial().and(TemplateFields)
  .superRefine((data, context) => compatibleTemplateFields(data, context as any, false));
const campaignService = new CampaignService();

function cursorPage(query: AuthenticatedRequest['query']): { cursor?: string; limit: number } | null {
  const cursor = typeof query['cursor'] === 'string' ? query['cursor'] : undefined;
  const requestedLimit = query['limit'] === undefined ? 50 : Number(query['limit']);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || (cursor && !z.string().uuid().safeParse(cursor).success)) return null;
  return cursor ? { cursor, limit: Math.min(requestedLimit, 100) } : { limit: Math.min(requestedLimit, 100) };
}

async function brandFor(req: AuthenticatedRequest, res: Response): Promise<{ brandId: string; restaurantId: string } | null> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (!req.user.restaurantId) { res.status(400).json({ error: 'No restaurant context found' }); return null; }
  const restaurant = await prisma.restaurant.findFirst({ where: { id: req.user.restaurantId, isActive: true }, select: { id: true, brandId: true } });
  if (!restaurant?.brandId) { res.status(404).json({ error: 'Active brand context not found' }); return null; }
  return { brandId: restaurant.brandId, restaurantId: restaurant.id };
}

function templateInput(data: Record<string, any>) {
  return {
    whatsappTemplateId: data.selectedTemplateId ?? data.whatsappTemplateId,
    whatsappTemplateLanguage: data.templateLanguage ?? data.whatsappTemplateLanguage,
    whatsappTemplateCategory: data.templateCategory ?? data.whatsappTemplateCategory,
    whatsappTemplateParameters: data.templateParameters ?? data.whatsappTemplateParameters,
  };
}

function requestKey(req: AuthenticatedRequest, bodyKey?: string): string | undefined {
  const raw = req.headers['idempotency-key'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (header && bodyKey && header !== bodyKey) throw new CampaignIdempotencyConflictError();
  const key = header ?? bodyKey;
  if (key !== undefined && (typeof key !== 'string' || key.trim().length < 1 || key.length > 200)) throw new Error('INVALID_IDEMPOTENCY_KEY');
  return key?.trim();
}

function campaignError(res: Response, error: any): void {
  if (error instanceof BusinessDateError || error?.message === 'INVALID_IDEMPOTENCY_KEY') { res.status(400).json({ error: error.message }); return; }
  if (error?.code === 'CAMPAIGN_IDEMPOTENCY_CONFLICT') { res.status(409).json({ error: error.message, code: error.code }); return; }
  if (typeof error?.code === 'string' && error.code.startsWith('WHATSAPP_TEMPLATE_')) { res.status(409).json({ error: error.message, code: error.code }); return; }
  res.status(500).json({ error: 'Internal server error' });
}

export class CampaignController {
  async getCampaigns(req: AuthenticatedRequest, res: Response): Promise<void> {
    try { const context = await brandFor(req, res); if (!context) return; const page = cursorPage(req.query); if (!page) { res.status(400).json({ error: 'Invalid pagination parameters' }); return; } res.json(await campaignService.getCampaigns(context.brandId, page)); }
    catch (error) { campaignError(res, error); }
  }

  async createCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validation = CreateCampaignSchema.safeParse(req.body); if (!validation.success) { res.status(400).json({ errors: validation.error.flatten().fieldErrors }); return; }
      const context = await brandFor(req, res); if (!context) return; const data = validation.data;
      const campaign = await campaignService.createCampaign(context.brandId, {
        name: data.name, channel: data.channel as CampaignChannel, segmentId: data.segmentId, templateSubject: data.templateSubject,
        templateBody: data.templateBody ?? '', ...templateInput(data),
        scheduledAt: localDateTime(data.scheduledAt, await restaurantTimezone(context.restaurantId)),
      }, requestKey(req, data.idempotencyKey));
      res.status(201).json({ message: 'Campaign saved as draft', campaign });
    } catch (error) { campaignError(res, error); }
  }

  async updateCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validation = PatchCampaignSchema.safeParse(req.body); if (!validation.success) { res.status(400).json({ errors: validation.error.flatten().fieldErrors }); return; }
      const context = await brandFor(req, res); if (!context) return; const data = validation.data;
      const patch: UpdateCampaignInput = {
        ...(data.name !== undefined ? { name: data.name } : {}), ...(data.channel !== undefined ? { channel: data.channel as CampaignChannel } : {}),
        ...(data.segmentId !== undefined ? { segmentId: data.segmentId } : {}), ...(data.templateSubject !== undefined ? { templateSubject: data.templateSubject } : {}),
        ...(data.templateBody !== undefined ? { templateBody: data.templateBody } : {}),
        ...(data.scheduledAt !== undefined ? { scheduledAt: localDateTime(data.scheduledAt, await restaurantTimezone(context.restaurantId)) } : {}),
        ...Object.fromEntries(Object.entries(templateInput(data)).filter(([, value]) => value !== undefined)),
      };
      const campaign = await campaignService.updateDraft(context.brandId, String(req.params['id']), patch);
      if (!campaign) { res.status(409).json({ error: 'Campaign is not an editable draft' }); return; }
      res.json({ campaign });
    } catch (error) { campaignError(res, error); }
  }

  async cancelCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
    try { const context = await brandFor(req, res); if (!context) return; if (!await campaignService.cancelCampaign(context.brandId, String(req.params['id']))) { res.status(409).json({ error: 'Campaign is terminal, missing, or unauthorized' }); return; } res.json({ cancelled: true }); }
    catch (error) { campaignError(res, error); }
  }

  async deleteCampaign(req: AuthenticatedRequest, res: Response): Promise<void> { return this.cancelCampaign(req, res); }

  async getCampaignLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try { const context = await brandFor(req, res); if (!context) return; const page = cursorPage(req.query); if (!page) { res.status(400).json({ error: 'Invalid pagination parameters' }); return; } res.json(await campaignService.getCampaignLogs(String(req.params['id']), context.brandId, page)); }
    catch (error) { campaignError(res, error); }
  }

  async getCampaignStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const context = await brandFor(req, res); if (!context) return;
      const groups = await prisma.campaign.groupBy({ by: ['channel', 'status'], where: { brandId: context.brandId, crmGeneration: 2 }, _count: { _all: true }, _sum: { sentCount: true, failedCount: true } });
      let totalSent = 0, totalFailed = 0, emailCount = 0, smsCount = 0, completedCount = 0, pendingCount = 0, totalCampaigns = 0;
      for (const group of groups) { const count = group._count._all; totalCampaigns += count; totalSent += group._sum.sentCount ?? 0; totalFailed += group._sum.failedCount ?? 0; if (group.channel === 'EMAIL') emailCount += count; else if (group.channel === 'SMS') smsCount += count; if (group.status === 'COMPLETED') completedCount += count; else if (['DRAFT', 'QUEUED', 'SENDING'].includes(group.status)) pendingCount += count; }
      res.json({ totalCampaigns, totalSent, totalFailed, emailCount, smsCount, completedCount, pendingCount });
    } catch (error) { campaignError(res, error); }
  }
}
