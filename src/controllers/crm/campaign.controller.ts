import { restaurantTimezone, timezone, localDateTime, BusinessDateError } from '../../lib/timezone';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';
import { CampaignService } from '../../services/crm/campaign.service';
import { z } from 'zod';
import { CampaignChannel } from '@prisma/client';

const CreateCampaignSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  channel: z.enum(['SMS', 'EMAIL', 'PUSH'] as const),
  segmentId: z.string().uuid('Invalid segment ID').optional().nullable(),
  templateSubject: z.string().max(100).optional().nullable(),
  templateBody: z.string().min(5, 'Message body must be at least 5 characters').max(1000),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid scheduled date'),
});

const campaignService = new CampaignService();

function cursorPage(query: AuthenticatedRequest['query']): { cursor?: string; limit: number } | null {
  const cursor = typeof query['cursor'] === 'string' ? query['cursor'] : undefined;
  const requestedLimit = query['limit'] === undefined ? 50 : Number(query['limit']);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) return null;
  if (cursor && !z.string().uuid().safeParse(cursor).success) return null;
  return cursor ? { cursor, limit: Math.min(requestedLimit, 100) } : { limit: Math.min(requestedLimit, 100) };
}

export class CampaignController {
  // Get all campaigns for brand
  async getCampaigns(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true, timezone: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const page = cursorPage(req.query);
      if (!page) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
      }
      const result = await campaignService.getCampaigns(brandId, page);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Create new campaign
  async createCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const validation = CreateCampaignSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ errors: validation.error.flatten().fieldErrors });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true, timezone: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const zone = user.restaurantId ? await restaurantTimezone(user.restaurantId) : timezone(ownerRecord?.restaurants?.[0]?.timezone);
      const campaign = await campaignService.createCampaign(brandId, {
        name: validation.data.name,
        channel: validation.data.channel as CampaignChannel,
        segmentId: validation.data.segmentId,
        templateSubject: validation.data.templateSubject,
        templateBody: validation.data.templateBody,
        scheduledAt: localDateTime(validation.data.scheduledAt, zone),
      });

      res.status(201).json({ message: 'Campaign queued successfully', campaign });
    } catch (err: any) {
      if (err instanceof BusinessDateError) { res.status(400).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Delete campaign template
  async deleteCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const campaignId = req.params['id'] as string;

      if (!user || !campaignId) {
        res.status(400).json({ error: 'Invalid parameters' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true, timezone: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      await campaignService.deleteCampaign(brandId, campaignId);
      res.status(200).json({ message: 'Campaign deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get campaign logs
  async getCampaignLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const campaignId = req.params['id'] as string;

      if (!user || !campaignId) {
        res.status(400).json({ error: 'Invalid parameters' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true, timezone: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const page = cursorPage(req.query);
      if (!page) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
      }
      const result = await campaignService.getCampaignLogs(campaignId, brandId, page);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get aggregate stats for campaigns
  async getCampaignStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true, timezone: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const groups = await prisma.campaign.groupBy({
        by: ['channel', 'status'],
        where: { brandId },
        _count: { _all: true },
        _sum: { sentCount: true, failedCount: true },
      });

      let totalSent = 0;
      let totalFailed = 0;
      let emailCount = 0;
      let smsCount = 0;
      let completedCount = 0;
      let pendingCount = 0;

      let totalCampaigns = 0;
      for (const group of groups) {
        const count = group._count._all;
        totalCampaigns += count;
        totalSent += group._sum.sentCount ?? 0;
        totalFailed += group._sum.failedCount ?? 0;
        if (group.channel === 'EMAIL') emailCount += count;
        else if (group.channel === 'SMS') smsCount += count;
        
        if (group.status === 'COMPLETED') completedCount += count;
        else if (group.status === 'QUEUED' || group.status === 'SENDING') pendingCount += count;
      }

      res.status(200).json({
        totalCampaigns,
        totalSent,
        totalFailed,
        emailCount,
        smsCount,
        completedCount,
        pendingCount,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
