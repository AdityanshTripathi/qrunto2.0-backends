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
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const campaigns = await campaignService.getCampaigns(brandId);
      res.status(200).json({ campaigns });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const campaign = await campaignService.createCampaign(brandId, {
        name: validation.data.name,
        channel: validation.data.channel as CampaignChannel,
        segmentId: validation.data.segmentId,
        templateSubject: validation.data.templateSubject,
        templateBody: validation.data.templateBody,
        scheduledAt: new Date(validation.data.scheduledAt),
      });

      res.status(201).json({ message: 'Campaign queued successfully', campaign });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      await campaignService.deleteCampaign(brandId, campaignId);
      res.status(200).json({ message: 'Campaign deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const logs = await campaignService.getCampaignLogs(campaignId, brandId);
      res.status(200).json({ logs });
    } catch (err: any) {
      res.status(505).json({ error: err.message });
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
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const campaigns = await prisma.campaign.findMany({
        where: { brandId }
      });

      let totalSent = 0;
      let totalFailed = 0;
      let emailCount = 0;
      let smsCount = 0;
      let completedCount = 0;
      let pendingCount = 0;

      for (const camp of campaigns) {
        totalSent += camp.sentCount;
        totalFailed += camp.failedCount;
        if (camp.channel === 'EMAIL') emailCount++;
        else if (camp.channel === 'SMS') smsCount++;
        
        if (camp.status === 'COMPLETED') completedCount++;
        else if (camp.status === 'QUEUED' || camp.status === 'SENDING') pendingCount++;
      }

      res.status(200).json({
        totalCampaigns: campaigns.length,
        totalSent,
        totalFailed,
        emailCount,
        smsCount,
        completedCount,
        pendingCount,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
