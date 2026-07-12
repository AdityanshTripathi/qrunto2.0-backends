import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';
import { CouponService } from '../../services/crm/coupon.service';
import { z } from 'zod';
import { CouponDiscountType } from '@prisma/client';

const CreateCouponSchema = z.object({
  code: z.string().min(2, 'Code must be at least 2 characters').max(30),
  discountType: z.enum(['PERCENTAGE', 'FIXED'] as const),
  discountValue: z.number().positive('Discount value must be greater than 0'),
  minOrderAmount: z.number().nonnegative().optional(),
  maxDiscountAmount: z.number().positive().optional().nullable(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date'),
});

const couponService = new CouponService();

export class CouponController {
  // Fetch coupons for owner's brand
  async getCoupons(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const coupons = await couponService.getCoupons(brandId);
      res.status(200).json({ coupons });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Create new coupon template
  async createCoupon(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const validation = CreateCouponSchema.safeParse(req.body);
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

      const coupon = await couponService.createCoupon(brandId, {
        code: validation.data.code,
        discountType: validation.data.discountType as CouponDiscountType,
        discountValue: validation.data.discountValue,
        minOrderAmount: validation.data.minOrderAmount ?? 0,
        maxDiscountAmount: validation.data.maxDiscountAmount ?? null,
        startDate: new Date(validation.data.startDate),
        endDate: new Date(validation.data.endDate),
      });

      res.status(201).json({ message: 'Coupon created successfully', coupon });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Delete coupon template
  async deleteCoupon(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const couponId = req.params['id'] as string;

      if (!user || !couponId) {
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

      await couponService.deleteCoupon(brandId, couponId);
      res.status(200).json({ message: 'Coupon deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Issue coupon to customer
  async issueCoupon(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const { customerId, couponId } = req.body;

      if (!user || !customerId || !couponId) {
        res.status(400).json({ error: 'Customer ID and Coupon ID are required' });
        return;
      }

      const issuance = await couponService.issueCouponToCustomer(customerId, couponId);
      res.status(200).json({ message: 'Coupon issued successfully', issuance });
    } catch (err: any) {
      res.status(505).json({ error: err.message });
    }
  }

  // Get available customer coupons
  async getCustomerCoupons(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const customerId = req.params['customerId'] as string;

      if (!user || !customerId) {
        res.status(400).json({ error: 'Customer ID is required' });
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

      const coupons = await couponService.getCustomerAvailableCoupons(customerId, brandId);
      res.status(200).json({ coupons });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
