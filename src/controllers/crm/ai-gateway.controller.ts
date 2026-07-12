import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';
import { z } from 'zod';

const UpdateSummarySchema = z.object({
  aiSummary: z.string().min(5, 'Summary must be at least 5 characters').max(2000),
});

export class AIGatewayController {
  // Search customers for AI integration
  async searchCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const query = (req.query['query'] as string) || '';

      const customers = await prisma.customer.findMany({
        where: {
          brandId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          profiles: {
            select: {
              totalSpend: true,
              totalOrders: true,
              aov: true,
              lastVisit: true,
              repeatStatus: true,
            },
          },
        },
        take: 50,
      });

      res.status(200).json({ customers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Save/Update AI summary of customer
  async updateCustomerSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const customerId = req.params['id'] as string;

      if (!user || !customerId) {
        res.status(400).json({ error: 'Invalid parameters' });
        return;
      }

      const validation = UpdateSummarySchema.safeParse(req.body);
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

      // Verify customer brand context
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, brandId },
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found or unauthorized' });
        return;
      }

      const updatedCustomer = await prisma.customer.update({
        where: { id: customerId },
        data: { aiSummary: validation.data.aiSummary },
      });

      res.status(200).json({
        message: 'AI summary updated successfully',
        aiSummary: updatedCustomer.aiSummary,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Get segment distributions details for AI planning
  async getSegmentsOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const segments = await prisma.segment.findMany({
        where: { brandId },
        include: {
          _count: {
            select: { customers: true },
          },
        },
      });

      res.status(200).json({ segments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Get loyalty points aggregate values for AI analytics
  async getLoyaltyOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const tiers = await prisma.loyaltyTier.findMany({
        where: { brandId },
        include: {
          _count: {
            select: { profiles: true },
          },
        },
      });

      const accounts = await prisma.loyaltyAccount.findMany({
        where: {
          customer: { brandId },
        },
      });

      const totalPoints = accounts.reduce((acc, curr) => acc + curr.pointsBalance, 0);
      const averagePoints = accounts.length > 0 ? totalPoints / accounts.length : 0;

      res.status(200).json({
        totalLoyaltyMembers: accounts.length,
        totalPointsHeld: totalPoints,
        averagePointsPerMember: parseFloat(averagePoints.toFixed(1)),
        tiersDistribution: tiers,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
