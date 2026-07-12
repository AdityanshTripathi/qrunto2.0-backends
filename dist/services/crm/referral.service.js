"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferralService = void 0;
const prisma_1 = require("../../lib/prisma");
const loyalty_service_1 = require("./loyalty.service");
const client_1 = require("@prisma/client");
const loyaltyService = new loyalty_service_1.LoyaltyService();
class ReferralService {
    // Generate memorable code based on customer name and phone
    generateCode(name, phone) {
        const cleanName = name.replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 4) || 'REF';
        const cleanPhone = phone.slice(-4) || '1234';
        return `ORDIO-${cleanName}-${cleanPhone}`;
    }
    // Claim a referral invite code
    claimReferral(brandId, refereePhone, referralCode) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Find referrer customer by searching metadata JSON
            const customers = yield prisma_1.prisma.customer.findMany({
                where: { brandId },
            });
            const referrer = customers.find((c) => {
                const meta = (c.metadataJson || {});
                return meta['referralCode'] === referralCode.trim().toUpperCase();
            });
            if (!referrer) {
                throw new Error('Referral code is invalid or expired');
            }
            // 2. Find or create referee customer
            let referee = yield prisma_1.prisma.customer.findFirst({
                where: { brandId, phone: refereePhone },
                include: { loyaltyAccount: true },
            });
            if (!referee) {
                // Create guest customer
                referee = yield prisma_1.prisma.customer.create({
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
            const refereeMeta = (referee.metadataJson || {});
            if (refereeMeta['claimedReferral']) {
                throw new Error('This phone number has already claimed a referral discount');
            }
            if (referee.id === referrer.id) {
                throw new Error('Self-referrals are not permitted');
            }
            // 3. Award 100 points to referrer loyalty account
            let referrerAccount = yield prisma_1.prisma.loyaltyAccount.findUnique({
                where: { customerId: referrer.id },
            });
            if (!referrerAccount) {
                referrerAccount = yield prisma_1.prisma.loyaltyAccount.create({
                    data: { customerId: referrer.id, pointsBalance: 0, lifetimePoints: 0 },
                });
            }
            yield loyaltyService.adjustPointsBalance(referrerAccount.id, 100, `Referral bonus: invited friend ${refereePhone}`);
            // 4. Award referee a referral discount coupon (₹50 OFF!)
            // Find or create global referral coupon campaign
            let couponCampaign = yield prisma_1.prisma.coupon.findFirst({
                where: { brandId, code: 'WELCOME50' },
            });
            if (!couponCampaign) {
                couponCampaign = yield prisma_1.prisma.coupon.create({
                    data: {
                        brandId,
                        code: 'WELCOME50',
                        discountType: client_1.CouponDiscountType.FIXED,
                        discountValue: 50,
                        minOrderAmount: 200,
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days validity
                        isActive: true,
                    },
                });
            }
            // Link customer coupon
            const customerCoupon = yield prisma_1.prisma.customerCoupon.create({
                data: {
                    couponId: couponCampaign.id,
                    customerId: referee.id,
                },
            });
            // 5. Mark claimedReferral as true in referee metadata
            const updatedMeta = Object.assign(Object.assign({}, refereeMeta), { claimedReferral: true, referredByCustomerId: referrer.id });
            yield prisma_1.prisma.customer.update({
                where: { id: referee.id },
                data: { metadataJson: updatedMeta },
            });
            // Emit system notifications
            yield prisma_1.prisma.notification.create({
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
        });
    }
}
exports.ReferralService = ReferralService;
//# sourceMappingURL=referral.service.js.map