import { prisma } from '../../lib/prisma';
import { CouponDiscountType } from '@prisma/client';
import { decimal, money, moneyNumber } from '../../lib/money';

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
  async issueCouponToCustomer(
    customerId: string,
    couponId: string,
    actorBrandId?: string
  ): Promise<any> {
    const coupon = await prisma.coupon.findFirst({
      where: {
        id: couponId,
        ...(actorBrandId ? { brandId: actorBrandId } : {}),
      },
      select: {
        id: true,
        brandId: true,
      },
    });

    if (!coupon) {
      throw new Error('Coupon campaign not found');
    }

    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        brandId: coupon.brandId,
      },
      select: { id: true },
    });

    if (!customer) {
      throw new Error('Customer and coupon do not belong to the same business');
    }

    const existing = await prisma.customerCoupon.findFirst({
      where: {
        customerId,
        couponId,
        isRedeemed: false,
      },
    });

    if (existing) {
      return existing;
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
    orderId: string | null,
    tx?: any,
    restaurantId?: string
  ): Promise<{ discountAmount: number; issuanceId: string }> {
    const client = tx || prisma;
    const now = new Date();
    if (!tx || !restaurantId) throw new Error('Coupon redemption requires an order transaction and restaurant');
    const customer = await client.customer.findFirst({ where: { id: customerId, profiles: { some: { restaurantId } } } });
    const restaurant = await client.restaurant.findUnique({ where: { id: restaurantId }, select: { brandId: true } });
    if (!customer || !restaurant?.brandId || customer.brandId !== restaurant.brandId) throw new Error('Customer not found in this restaurant brand');

    // 1. Find coupon template
    const coupon = await client.coupon.findFirst({
      where: {
        brandId: restaurant.brandId,
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
    if (decimal(orderAmount).lt(coupon.minOrderAmount)) {
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
    let discountAmount = decimal(0);
    if (coupon.discountType === CouponDiscountType.FIXED) {
      discountAmount = decimal(coupon.discountValue);
    } else if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
      discountAmount = money(decimal(orderAmount).times(coupon.discountValue).dividedBy(100));
      if (coupon.maxDiscountAmount !== null) {
        if (discountAmount.gt(coupon.maxDiscountAmount)) discountAmount = decimal(coupon.maxDiscountAmount);
      }
    }

    if (discountAmount.gt(orderAmount)) discountAmount = decimal(orderAmount);
    discountAmount = money(discountAmount);

    // 5. Update issuance record to REDEEMED
    const claimed = await client.customerCoupon.updateMany({
      where: { id: issuance.id, customerId, couponId: coupon.id, isRedeemed: false },
      data: {
        isRedeemed: true,
        redeemedAt: now,
        orderId,
      },
    });

    if (claimed.count !== 1) throw new Error('Coupon already redeemed');
    return { discountAmount: moneyNumber(discountAmount), issuanceId: issuance.id };
  }
}
