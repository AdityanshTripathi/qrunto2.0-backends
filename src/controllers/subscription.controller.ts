import { Request, Response } from 'express';
import { z } from 'zod';
import { SubscriptionService } from '../services/subscription.service';
import { prisma } from '../lib/prisma';
import { restaurantTimezone } from '../lib/timezone';

const subscriptionService = new SubscriptionService();

const CreateSubscriptionSchema = z.object({
  planId: z.string().uuid('Invalid plan ID format'),
});

export class SubscriptionController {
  async createPendingSubscription(req: Request, res: Response): Promise<void> {
    try {
      // 1. Check authentication
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this user session' });
        return;
      }

      // 2. Validate input
      const validationResult = CreateSubscriptionSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      // 3. Call service
      const subscription = await subscriptionService.createPendingSubscription(
        restaurantId,
        validationResult.data.planId
      );

      res.status(201).json({ subscription });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async getActiveSubscription(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this user session' });
        return;
      }

      const subscription = await subscriptionService.getActiveSubscription(restaurantId);
      res.status(200).json({ subscription });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async redeemLicenseCode(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this user session' });
        return;
      }

      const { code } = req.body;
      if (!code) {
        res.status(400).json({ error: 'License code is required' });
        return;
      }

      const cleanCode = code.toUpperCase().trim();
      const zone = await restaurantTimezone(restaurantId);

      // Find the code
      const promoCode = await prisma.promoCode.findUnique({
        where: { code: cleanCode },
        include: { plan: true }
      });

      if (!promoCode) {
        res.status(404).json({ error: 'Invalid license code' });
        return;
      }

      if (!promoCode.isActive) {
        res.status(400).json({ error: 'This license code is inactive' });
        return;
      }

      if (promoCode.expiresAt && new Date(promoCode.expiresAt).getTime() < Date.now()) {
        res.status(400).json({ error: 'This license code has expired' });
        return;
      }

      if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
        res.status(400).json({ error: 'This license code has reached its usage limit' });
        return;
      }

      if (!promoCode.planId || !promoCode.plan || !promoCode.durationDays) {
        res.status(400).json({ error: 'License code is not configured correctly' });
        return;
      }

      const planName = promoCode.plan.name;

      // Check if restaurant already has an active subscription to extend
      const activeSubscription = await prisma.subscription.findFirst({
        where: {
          restaurantId,
          status: 'ACTIVE',
          endDate: { gte: new Date() }
        }
      });

      const now = new Date();
      let startDate = new Date();
      let endDate = new Date();

      if (activeSubscription && activeSubscription.planId === promoCode.planId) {
        // Extend existing subscription
        startDate = new Date(activeSubscription.startDate);
        endDate = new Date(activeSubscription.endDate);
        endDate.setUTCDate(endDate.getUTCDate() + promoCode.durationDays);
      } else {
        // Create new subscription
        endDate.setUTCDate(endDate.getUTCDate() + promoCode.durationDays);
      }

      // Perform transaction
      await prisma.$transaction(async (tx) => {
        // 1. If switching plans, set previous active subscriptions to CANCELLED
        if (activeSubscription && activeSubscription.planId !== promoCode.planId) {
          await tx.subscription.updateMany({
            where: { restaurantId, status: 'ACTIVE' },
            data: { status: 'CANCELLED' }
          });
        }

        // 2. Create or update the subscription
        if (activeSubscription && activeSubscription.planId === promoCode.planId) {
          await tx.subscription.update({
            where: { id: activeSubscription.id },
            data: { endDate }
          });
        } else {
          await tx.subscription.create({
            data: {
              restaurantId,
              planId: promoCode.planId!,
              status: 'ACTIVE',
              startDate,
              endDate
            }
          });
        }

        // 3. Increment code usage count
        await tx.promoCode.update({
          where: { id: promoCode.id },
          data: {
            usageCount: { increment: 1 }
          }
        });

        // 4. Create redemption log
        await tx.promoRedemption.create({
          data: {
            promoCodeId: promoCode.id,
            restaurantId,
            subscriptionStart: startDate,
            subscriptionEnd: endDate
          }
        });

        // 5. Create a billing notification for the restaurant
        await tx.notification.create({
          data: {
            restaurantId,
            title: 'Plan Activated Successfully',
            message: `Your subscription to the ${planName} plan has been activated. Valid until ${endDate.toLocaleDateString('en-IN', { timeZone: zone })}.`,
            type: 'BILLING'
          }
        });
      });

      res.status(200).json({
        message: `License code redeemed successfully! Active plan: ${planName}`,
        planName,
        expiresAt: endDate
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async purchaseSubscription(req: Request, res: Response): Promise<void> {
    if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
    // Fail closed until a real provider integration can verify payment server-side.
    res.status(503).json({ error: 'Online subscription purchases are unavailable. Contact support for activation.' });
  }
}
