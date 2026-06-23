import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { UserRole, PaymentStatus, PasscodeResetStatus } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_12345';

export class SuperAdminController {
  // ─── GET /api/superadmin/dashboard-stats ──────────────────────────────────
  async getDashboardStats(req: Request, res: Response): Promise<void> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // 1. Restaurants counts
      const totalRestaurants = await prisma.restaurant.count();
      const activeRestaurants = await prisma.restaurant.count({ where: { isActive: true } });
      
      const activeSubs = await prisma.subscription.findMany({
        where: { status: 'ACTIVE', endDate: { gte: now } },
        include: { plan: true },
      });
      const activeCount = activeSubs.length;

      // Classify as Expired if they have no active subscription
      const expiredRestaurants = Math.max(0, totalRestaurants - activeCount);
      
      // Classify Trial vs Paid
      let trialRestaurants = 0;
      let paidRestaurants = 0;
      activeSubs.forEach((sub) => {
        if (sub.plan.price === 0) {
          trialRestaurants++;
        } else {
          paidRestaurants++;
        }
      });

      // 2. Revenue (Last 30 Days)
      const revenueAgg = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: 'SUCCESS',
          paidAt: { gte: thirtyDaysAgo },
        },
      });
      const monthlyRevenue = revenueAgg._sum.amount ?? 0;

      // 3. Orders counts
      const totalOrders = await prisma.order.count();
      const todayOrders = await prisma.order.count({
        where: { createdAt: { gte: todayStart } },
      });

      // 4. Averages
      const averageRevenuePerRest = activeRestaurants > 0 ? parseFloat((monthlyRevenue / activeRestaurants).toFixed(2)) : 0;

      // 5. Subscription growth / distribution
      const planDistribution = await prisma.subscriptionPlan.findMany({
        include: {
          _count: {
            select: {
              subscriptions: {
                where: { status: 'ACTIVE', endDate: { gte: now } },
              },
            },
          },
        },
      });

      // 6. Recent Restaurants
      const recentRestaurants = await prisma.restaurant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          owner: { select: { name: true, email: true } },
        },
      });

      res.status(200).json({
        kpis: {
          totalRestaurants,
          activeRestaurants,
          trialRestaurants,
          expiredRestaurants,
          monthlyRevenue,
          totalOrders,
          todayOrders,
          averageRevenuePerRest,
        },
        planDistribution: planDistribution.map((p) => ({
          name: p.name,
          price: p.price,
          count: p._count.subscriptions,
        })),
        recentRestaurants: recentRestaurants.map((r) => ({
          id: r.id,
          name: r.name,
          ownerName: r.owner.name,
          ownerEmail: r.owner.email,
          createdAt: r.createdAt,
          isActive: r.isActive,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── GET /api/superadmin/restaurants ──────────────────────────────────────
  async getRestaurants(req: Request, res: Response): Promise<void> {
    try {
      const restaurants = await prisma.restaurant.findMany({
        include: {
          owner: { select: { name: true, email: true } },
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { endDate: 'desc' },
            take: 1,
            include: { plan: true },
          },
          _count: {
            select: { orders: true, tables: true, menuItems: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      res.status(200).json({
        restaurants: restaurants.map((r) => ({
          id: r.id,
          name: r.name,
          ownerName: r.owner.name,
          ownerEmail: r.owner.email,
          phone: r.phone,
          address: r.address,
          isActive: r.isActive,
          createdAt: r.createdAt,
          planName: r.subscriptions[0]?.plan.name ?? 'No active plan',
          expiryDate: r.subscriptions[0]?.endDate ?? null,
          stats: {
            ordersCount: r._count.orders,
            tablesCount: r._count.tables,
            menuItemsCount: r._count.menuItems,
          },
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── PATCH /api/superadmin/restaurants/:id/toggle-status ──────────────────
  async toggleRestaurantStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params['id'] as string;
      const restaurant = await prisma.restaurant.findUnique({ where: { id } });
      if (!restaurant) {
        res.status(404).json({ error: 'Restaurant not found' });
        return;
      }

      const updated = await prisma.restaurant.update({
        where: { id },
        data: { isActive: !restaurant.isActive },
      });

      res.status(200).json({
        message: `Restaurant ${updated.name} has been ${updated.isActive ? 'activated' : 'suspended'}!`,
        restaurant: updated,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/superadmin/restaurants/:id/login-as ────────────────────────
  async generateLoginAsToken(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params['id'] as string;
      const restaurant = await prisma.restaurant.findUnique({
        where: { id },
        include: { owner: true },
      });
      if (!restaurant) {
        res.status(404).json({ error: 'Restaurant not found' });
        return;
      }

      // Generate owner bypass JWT token
      const token = jwt.sign(
        {
          id: restaurant.owner.id,
          email: restaurant.owner.email,
          role: UserRole.RESTAURANT_OWNER,
          restaurantId: restaurant.id,
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.status(200).json({
        token,
        ownerName: restaurant.owner.name,
        restaurantName: restaurant.name,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/superadmin/plans ───────────────────────────────────────────
  async createPlan(req: Request, res: Response): Promise<void> {
    try {
      const { name, price, price6Month, price1Year, durationDays, maxTables, maxMenuItems, featuresJson } = req.body;
      if (!name || price === undefined || !durationDays) {
        res.status(400).json({ error: 'Name, price, and duration are required' });
        return;
      }

      const plan = await prisma.subscriptionPlan.create({
        data: {
          name,
          price: parseFloat(price),
          price6Month: price6Month !== undefined ? parseFloat(price6Month) : 0,
          price1Year: price1Year !== undefined ? parseFloat(price1Year) : 0,
          durationDays: parseInt(durationDays),
          maxTables: parseInt(maxTables || '10'),
          maxMenuItems: parseInt(maxMenuItems || '50'),
          featuresJson: featuresJson || null,
        },
      });

      res.status(201).json({ message: 'Plan created successfully!', plan });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── PATCH /api/superadmin/plans/:id ──────────────────────────────────────
  async updatePlan(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params['id'] as string;
      const { name, price, price6Month, price1Year, durationDays, maxTables, maxMenuItems, featuresJson, isActive } = req.body;

      const plan = await prisma.subscriptionPlan.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(price !== undefined ? { price: parseFloat(price) } : {}),
          ...(price6Month !== undefined ? { price6Month: parseFloat(price6Month) } : {}),
          ...(price1Year !== undefined ? { price1Year: parseFloat(price1Year) } : {}),
          ...(durationDays ? { durationDays: parseInt(durationDays) } : {}),
          ...(maxTables ? { maxTables: parseInt(maxTables) } : {}),
          ...(maxMenuItems ? { maxMenuItems: parseInt(maxMenuItems) } : {}),
          ...(featuresJson !== undefined ? { featuresJson } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      res.status(200).json({ message: 'Plan updated successfully!', plan });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/superadmin/license-codes ───────────────────────────────────
  async generateLicenseCode(req: Request, res: Response): Promise<void> {
    try {
      const { code, planId, durationDays, usageLimit, expiresAt } = req.body;
      if (!planId || !durationDays) {
        res.status(400).json({ error: 'Subscription Plan and Duration are required' });
        return;
      }

      // Generate a clean format if not provided, e.g. QR1M-XXXXXX
      let finalCode = code?.toUpperCase().trim();
      if (!finalCode) {
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        finalCode = `QR-${durationDays}D-${rand}`;
      }

      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        res.status(404).json({ error: 'Subscription Plan not found' });
        return;
      }

      const newCode = await prisma.promoCode.create({
        data: {
          code: finalCode,
          type: 'FREE_TRIAL', // Defaults to activation/trial code type
          value: 0,
          planId,
          durationDays: parseInt(durationDays),
          usageLimit: usageLimit ? parseInt(usageLimit) : 1,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });

      res.status(201).json({ message: 'License Code generated successfully!', code: newCode });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── GET /api/superadmin/license-codes ────────────────────────────────────
  async listLicenseCodes(req: Request, res: Response): Promise<void> {
    try {
      const codes = await prisma.promoCode.findMany({
        include: {
          plan: { select: { name: true } },
          _count: { select: { redemptions: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        codes: codes.map((c) => ({
          id: c.id,
          code: c.code,
          planName: c.plan?.name ?? 'Generic Promo',
          durationDays: c.durationDays,
          usageLimit: c.usageLimit,
          usageCount: c.usageCount,
          redemptionsCount: c._count.redemptions,
          expiresAt: c.expiresAt,
          isActive: c.isActive,
          createdAt: c.createdAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── GET /api/superadmin/transactions ─────────────────────────────────────
  async getTransactions(req: Request, res: Response): Promise<void> {
    try {
      const payments = await prisma.payment.findMany({
        include: {
          restaurant: { select: { name: true } },
          order: { select: { orderNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        payments: payments.map((p) => ({
          id: p.id,
          restaurantName: p.restaurant.name,
          orderNumber: p.order?.orderNumber ?? 'N/A',
          amount: p.amount,
          status: p.status,
          paymentMethod: p.paymentMethod,
          paidAt: p.paidAt,
          createdAt: p.createdAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── DELETE /api/superadmin/restaurants/:id ──────────────────────────────
  async deleteRestaurant(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params['id'] as string;
      const restaurant = await prisma.restaurant.findUnique({
        where: { id },
        include: { owner: true }
      });

      if (!restaurant) {
        res.status(404).json({ error: 'Restaurant not found' });
        return;
      }

      const ownerId = restaurant.ownerId;

      // Delete the restaurant (cascading deletes categories, menu items, orders, tables, subscriptions, settings)
      await prisma.restaurant.delete({
        where: { id }
      });

      // If the owner has no other restaurants, delete the owner user account
      if (ownerId) {
        const otherRestCount = await prisma.restaurant.count({
          where: { ownerId }
        });
        if (otherRestCount === 0) {
          await prisma.user.delete({
            where: { id: ownerId }
          });
        }
      }

      res.status(200).json({ message: `Restaurant ${restaurant.name} and its associated records have been deleted successfully!` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── DELETE /api/superadmin/plans/:id ─────────────────────────────────────
  async deletePlan(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params['id'] as string;
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id }
      });

      if (!plan) {
        res.status(404).json({ error: 'Subscription plan not found' });
        return;
      }

      // Delete inside transaction to clean up referenced Subscriptions and PromoCodes
      await prisma.$transaction([
        prisma.subscription.deleteMany({ where: { planId: id } }),
        prisma.promoCode.deleteMany({ where: { planId: id } }),
        prisma.subscriptionPlan.delete({ where: { id } })
      ]);

      res.status(200).json({ message: `Subscription plan ${plan.name} deleted successfully!` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── DELETE /api/superadmin/license-codes/:id ─────────────────────────────
  async deleteLicenseCode(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params['id'] as string;
      const code = await prisma.promoCode.findUnique({
        where: { id }
      });

      if (!code) {
        res.status(404).json({ error: 'License code not found' });
        return;
      }

      // Deleting a PromoCode cascades to PromoRedemptions
      await prisma.promoCode.delete({
        where: { id }
      });

      res.status(200).json({ message: `License code ${code.code} deleted successfully!` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── GET /api/superadmin/passcode-resets ──────────────────────────────────
  async getPasscodeResets(req: Request, res: Response): Promise<void> {
    try {
      const requests = await prisma.passcodeResetRequest.findMany({
        include: {
          restaurant: {
            select: {
              name: true,
              slug: true,
              owner: {
                select: {
                  name: true,
                  email: true,
                }
              }
            }
          }
        },
        orderBy: { requestedAt: 'desc' },
      });

      res.status(200).json({ requests });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── PATCH /api/superadmin/passcode-resets/:id/action ───────────────────────
  async handlePasscodeReset(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params['id'] as string;
      const { action } = req.body; // 'approve' | 'reject'

      if (action !== 'approve' && action !== 'reject') {
        res.status(400).json({ error: "Invalid action. Must be 'approve' or 'reject'." });
        return;
      }

      const request = await prisma.passcodeResetRequest.findUnique({
        where: { id },
      });

      if (!request) {
        res.status(404).json({ error: 'Passcode reset request not found.' });
        return;
      }

      if (request.status !== PasscodeResetStatus.PENDING) {
        res.status(400).json({ error: `Cannot process request in ${request.status} status.` });
        return;
      }

      const newStatus = action === 'approve' ? PasscodeResetStatus.APPROVED : PasscodeResetStatus.REJECTED;

      const updated = await prisma.passcodeResetRequest.update({
        where: { id },
        data: {
          status: newStatus,
          processedAt: new Date(),
        },
      });

      res.status(200).json({
        message: `Passcode reset request has been ${action === 'approve' ? 'approved' : 'rejected'} successfully!`,
        request: updated,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
