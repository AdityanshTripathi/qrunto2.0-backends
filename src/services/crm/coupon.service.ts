import { prisma } from '../../lib/prisma';
import { CouponDiscountType } from '@prisma/client';

export interface CreateCouponInput {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  startDate: Date;
  endDate: Date;
}

export class CouponService {
  // Create a new coupon campaign template
  async createCoupon(brandId: string, data: CreateCouponInput): Promise<any> {
    const existing = await prisma.coupon.findFirst({
      where: { brandId, code: { equals: data.code, mode: 'insensitive' } },
    });

    if (existing) {
      throw new Error(`A coupon campaign with the code "${data.code}" already exists`);
    }

    return prisma.coupon.create({
      data: {
        brandId,
        code: data.code.toUpperCase(),
        discountType: data.discountType,
        discountValue: data.discountValue,
        minOrderAmount: data.minOrderAmount ?? 0,
        maxDiscountAmount: data.maxDiscountAmount ?? null,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });
  }

  // Get active/inactive coupon campaigns for brand
  async getCoupons(brandId: string): Promise<any[]> {
    return prisma.coupon.findMany({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Delete coupon template
  async deleteCoupon(brandId: string, couponId: string): Promise<void> {
    const coupon = await prisma.coupon.findFirst({
      where: { id: couponId, brandId },
    });

    if (!coupon) {
      throw new Error('Coupon campaign not found or unauthorized');
    }

    await prisma.coupon.delete({
      where: { id: couponId },
    });
  }

  // Issue coupon directly to a customer (personalized coupons)
  async issueCouponToCustomer(customerId: string, couponId: string): Promise<any> {
    // Verify coupon exists
    const coupon = await prisma.coupon.findUnique({
      where: { id: couponId },
    });

    if (!coupon) {
      throw new Error('Coupon campaign not found');
    }

    // Verify if already issued to this customer and not redeemed
    const existing = await prisma.customerCoupon.findFirst({
      where: { customerId, couponId, isRedeemed: false },
    });

    if (existing) {
      return existing; // already issued
    }

    return prisma.customerCoupon.create({
      data: {
        couponId,
        customerId,
        isRedeemed: false,
      },
    });
  }

  // Fetch all coupons issued to a customer (available for checkout)
  async getCustomerAvailableCoupons(customerId: string, brandId: string): Promise<any[]> {
    const now = new Date();
    
    return prisma.customerCoupon.findMany({
      where: {
        customerId,
        isRedeemed: false,
        coupon: {
          brandId,
          isActive: true,
          startDate: { lte: now },
          endDate: { gte: now },
        },
      },
      include: {
        coupon: true,
      },
    });
  }

  // Validate and redeem a coupon on checkouts
  async validateAndRedeem(
    customerId: string,
    couponCode: string,
    orderAmount: number,
    orderId: string,
    tx?: any
  ): Promise<{ discountAmount: number }> {
    const client = tx || prisma;
    const now = new Date();

    // 1. Find coupon template
    const coupon = await client.coupon.findFirst({
      where: {
        code: { equals: couponCode, mode: 'insensitive' },
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    if (!coupon) {
      throw new Error('Invalid or expired coupon code');
    }

    // 2. Validate order subtotal requirement
    if (orderAmount < coupon.minOrderAmount) {
      throw new Error(`Order amount must be at least ₹${coupon.minOrderAmount} to use this coupon`);
    }

    // 3. Find customer specific issuance
    const issuance = await client.customerCoupon.findFirst({
      where: {
        customerId,
        couponId: coupon.id,
        isRedeemed: false,
      },
    });

    if (!issuance) {
      throw new Error('This coupon is not available or has already been redeemed by this customer');
    }

    // 4. Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === CouponDiscountType.FIXED) {
      discountAmount = coupon.discountValue;
    } else if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
      discountAmount = (orderAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
      }
    }

    discountAmount = Math.min(discountAmount, orderAmount);

    // 5. Update issuance record to REDEEMED
    await client.customerCoupon.update({
      where: { id: issuance.id },
      data: {
        isRedeemed: true,
        redeemedAt: now,
        orderId,
      },
    });

    return { discountAmount };
  }
}
