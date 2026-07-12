import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';
import { SegmentService } from '../../services/crm/segment.service';
import { RFMService } from '../../services/crm/rfm.service';
import { z } from 'zod';

const CreateSegmentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  description: z.string().max(200).optional().nullable(),
  criteria: z.object({
    minSpend: z.number().nonnegative().optional(),
    minOrders: z.number().int().nonnegative().optional(),
    lastVisitDaysAgo: z.number().int().nonnegative().optional(),
    visitedWithinDays: z.number().int().nonnegative().optional(),
    dietary: z.string().optional(),
    seating: z.string().optional(),
  }),
});

const segmentService = new SegmentService();
const rfmService = new RFMService();

export class SegmentController {
  // Get all segments for brand
  async getSegments(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const segments = await segmentService.getSegments(brandId);
      res.status(200).json({ segments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Create new segment campaign
  async createSegment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const validation = CreateSegmentSchema.safeParse(req.body);
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

      const { name, description, criteria } = validation.data;
      const segment = await segmentService.createSegment(brandId, name, description ?? null, criteria);

      res.status(201).json({ message: 'Segment created and evaluated successfully', segment });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Delete segment campaign
  async deleteSegment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const segmentId = req.params['id'] as string;

      if (!user || !segmentId) {
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

      await segmentService.deleteSegment(brandId, segmentId);
      res.status(200).json({ message: 'Segment deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Fetch segment members
  async getSegmentMembers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const segmentId = req.params['id'] as string;

      if (!user || !segmentId) {
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

      const members = await segmentService.getSegmentMembers(brandId, segmentId);
      res.status(200).json({ members });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Force re-evaluate segment membership
  async retraceSegment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const segmentId = req.params['id'] as string;

      if (!user || !segmentId) {
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

      const size = await segmentService.evaluateSegment(segmentId, brandId);
      res.status(200).json({ message: `Segment re-evaluated successfully. Members: ${size}`, size });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Get RFM scores breakdown
  async getRFMScores(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const rfmResults = await rfmService.calculateRFM(brandId);
      
      // Group results for matrix counting
      const matrix = {
        'Champions': 0,
        'Loyal Customers': 0,
        'Recent / New': 0,
        'Promising': 0,
        'At Risk / Churn Alert': 0,
        'Can\'t Lose Them': 0,
        'Lost / Cold': 0,
        'Need Attention': 0,
      };

      for (const item of rfmResults) {
        const seg = item.segment as keyof typeof matrix;
        if (matrix[seg] !== undefined) {
          matrix[seg]++;
        } else {
          matrix['Need Attention']++;
        }
      }

      res.status(200).json({ rfm: rfmResults, matrix });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
