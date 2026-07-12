import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';
import { z } from 'zod';

const LoyaltyTierSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  minSpend: z.number().nonnegative('Minimum spend must be a non-negative number'),
  multiplier: z.number().positive('Multiplier must be greater than 0'),
});

export class LoyaltyController {
  // Fetch loyalty tiers for the owner's brand
  async getTiers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get brand context
      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found for this account' });
        return;
      }

      const tiers = await prisma.loyaltyTier.findMany({
        where: { brandId },
        orderBy: { minSpend: 'asc' },
      });

      res.status(200).json({ tiers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Create or update a loyalty tier
  async upsertTier(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const tierId = req.params['id'] as string | undefined; // optional id in path for edit
      
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const validation = LoyaltyTierSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ errors: validation.error.flatten().fieldErrors });
        return;
      }

      const { name, minSpend, multiplier } = validation.data;

      // Get brand context
      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found for this account' });
        return;
      }

      let tier;

      if (tierId) {
        // Update existing tier
        // Multi-tenant verify
        const existing = await prisma.loyaltyTier.findFirst({
          where: { id: tierId, brandId },
        });

        if (!existing) {
          res.status(404).json({ error: 'Loyalty tier not found or unauthorized' });
          return;
        }

        tier = await prisma.loyaltyTier.update({
          where: { id: tierId },
          data: {
            name,
            minSpend,
            multiplier,
          },
        });
      } else {
        // Create new tier
        // Check if name is unique under this brand
        const duplicate = await prisma.loyaltyTier.findFirst({
          where: { brandId, name: { equals: name, mode: 'insensitive' } },
        });

        if (duplicate) {
          res.status(400).json({ error: `A loyalty tier with the name "${name}" already exists` });
          return;
        }

        tier = await prisma.loyaltyTier.create({
          data: {
            brandId,
            name,
            minSpend,
            multiplier,
          },
        });
      }

      res.status(200).json({ message: 'Loyalty tier saved successfully', tier });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Delete loyalty tier
  async deleteTier(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const tierId = req.params['id'] as string;

      if (!user || !tierId) {
        res.status(400).json({ error: 'Invalid request parameters' });
        return;
      }

      // Get brand context
      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      // Check tier belongs to brand
      const existing = await prisma.loyaltyTier.findFirst({
        where: { id: tierId, brandId },
      });

      if (!existing) {
        res.status(404).json({ error: 'Loyalty tier not found or unauthorized' });
        return;
      }

      // Delete tier
      await prisma.loyaltyTier.delete({
        where: { id: tierId },
      });

      res.status(200).json({ message: 'Loyalty tier deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Fetch loyalty details by phone number (authenticated)
  async getBalanceByPhone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const phone = req.query['phone'] as string;

      if (!user || !phone) {
        res.status(400).json({ error: 'Phone number is required' });
        return;
      }

      // Get brand context
      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { id: true, brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      const restaurantId = ownerRecord?.restaurants?.[0]?.id;
      
      if (!brandId || !restaurantId) {
        res.status(400).json({ error: 'No brand/restaurant context found' });
        return;
      }

      const customer = await prisma.customer.findFirst({
        where: { brandId, phone },
        include: {
          loyaltyAccount: true,
          profiles: {
            where: { restaurantId },
            include: { loyaltyTier: true }
          }
        }
      });

      if (!customer) {
        res.status(200).json({ pointsBalance: 0, lifetimePoints: 0, tierName: null, multiplier: 1.0 });
        return;
      }

      const pointsBalance = customer.loyaltyAccount?.pointsBalance || 0;
      const lifetimePoints = customer.loyaltyAccount?.lifetimePoints || 0;
      const tierName = customer.profiles?.[0]?.loyaltyTier?.name || null;
      const multiplier = customer.profiles?.[0]?.loyaltyTier?.multiplier || 1.0;

      res.status(200).json({ pointsBalance, lifetimePoints, tierName, multiplier });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
