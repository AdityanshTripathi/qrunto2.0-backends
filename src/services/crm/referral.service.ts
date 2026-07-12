import { prisma } from '../../lib/prisma';
import { LoyaltyService } from './loyalty.service';
import { CouponService } from './coupon.service';
import { CouponDiscountType } from '@prisma/client';

const loyaltyService = new LoyaltyService();

export class ReferralService {
  // Generate memorable code based on customer name and phone
  generateCode(name: string, phone: string): string {
    const cleanName = name.replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 4) || 'REF';
    const cleanPhone = phone.slice(-4) || '1234';
    return `ORDIO-${cleanName}-${cleanPhone}`;
  }

  // Claim a referral invite code
  async claimReferral(brandId: string, refereePhone: string, referralCode: string): Promise<any> {
    // 1. Find referrer customer by searching metadata JSON
    const customers = await prisma.customer.findMany({
      where: { brandId },
    });

    const referrer = customers.find((c) => {
      const meta = (c.metadataJson || {}) as Record<string, any>;
      return meta['referralCode'] === referralCode.trim().toUpperCase();
    });

    if (!referrer) {
      throw new Error('Referral code is invalid or expired');
    }

    // 2. Find or create referee customer
    let referee = await prisma.customer.findFirst({
      where: { brandId, phone: refereePhone },
      include: { loyaltyAccount: true },
    });

    if (!referee) {
      // Create guest customer
      referee = await prisma.customer.create({
        data: {
          brandId,
          name: 'Invited Friend',
          phone: refereePhone,
          acquisitionSource: 'REFERRAL',
          metadataJson: {
            referralCode: this.generateCode('Invited', refereePhone),
          },
        },
        include: { loyaltyAccount: true },
      });
    }

    const refereeMeta = (referee.metadataJson || {}) as Record<string, any>;
    if (refereeMeta['claimedReferral']) {
      throw new Error('This phone number has already claimed a referral discount');
    }

    if (referee.id === referrer.id) {
      throw new Error('Self-referrals are not permitted');
    }

    // 3. Award 100 points to referrer loyalty account
    let referrerAccount = await prisma.loyaltyAccount.findUnique({
      where: { customerId: referrer.id },
    });

    if (!referrerAccount) {
      referrerAccount = await prisma.loyaltyAccount.create({
        data: { customerId: referrer.id, pointsBalance: 0, lifetimePoints: 0 },
      });
    }

    await loyaltyService.adjustPointsBalance(
      referrerAccount.id,
      100,
      `Referral bonus: invited friend ${refereePhone}`
    );

    // 4. Award referee a referral discount coupon (₹50 OFF!)
    // Find or create global referral coupon campaign
    let couponCampaign = await prisma.coupon.findFirst({
      where: { brandId, code: 'WELCOME50' },
    });

    if (!couponCampaign) {
      couponCampaign = await prisma.coupon.create({
        data: {
          brandId,
          code: 'WELCOME50',
          discountType: CouponDiscountType.FIXED,
          discountValue: 50,
          minOrderAmount: 200,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days validity
          isActive: true,
        },
      });
    }

    // Link customer coupon
    const customerCoupon = await prisma.customerCoupon.create({
      data: {
        couponId: couponCampaign.id,
        customerId: referee.id,
      },
    });

    // 5. Mark claimedReferral as true in referee metadata
    const updatedMeta = {
      ...refereeMeta,
      claimedReferral: true,
      referredByCustomerId: referrer.id,
    };

    await prisma.customer.update({
      where: { id: referee.id },
      data: { metadataJson: updatedMeta },
    });

    // Emit system notifications
    await prisma.notification.create({
      data: {
        restaurantId: brandId,
        title: `🤝 Referral Successful`,
        message: `${referrer.name} referred ${refereePhone}. Referrer earned 100 points, referee received ₹50 Coupon.`,
        type: 'SYSTEM',
      },
    });

    return {
      success: true,
      referrerName: referrer.name,
      refereeCoupon: couponCampaign.code,
    };
  }
}
