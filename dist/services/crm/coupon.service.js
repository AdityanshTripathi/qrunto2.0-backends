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
exports.CouponService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class CouponService {
    // Create a new coupon campaign template
    createCoupon(brandId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const existing = yield prisma_1.prisma.coupon.findFirst({
                where: { brandId, code: { equals: data.code, mode: 'insensitive' } },
            });
            if (existing) {
                throw new Error(`A coupon campaign with the code "${data.code}" already exists`);
            }
            return prisma_1.prisma.coupon.create({
                data: {
                    brandId,
                    code: data.code.toUpperCase(),
                    discountType: data.discountType,
                    discountValue: data.discountValue,
                    minOrderAmount: (_a = data.minOrderAmount) !== null && _a !== void 0 ? _a : 0,
                    maxDiscountAmount: (_b = data.maxDiscountAmount) !== null && _b !== void 0 ? _b : null,
                    startDate: data.startDate,
                    endDate: data.endDate,
                },
            });
        });
    }
    // Get active/inactive coupon campaigns for brand
    getCoupons(brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.coupon.findMany({
                where: { brandId },
                orderBy: { createdAt: 'desc' },
            });
        });
    }
    // Delete coupon template
    deleteCoupon(brandId, couponId) {
        return __awaiter(this, void 0, void 0, function* () {
            const coupon = yield prisma_1.prisma.coupon.findFirst({
                where: { id: couponId, brandId },
            });
            if (!coupon) {
                throw new Error('Coupon campaign not found or unauthorized');
            }
            yield prisma_1.prisma.coupon.delete({
                where: { id: couponId },
            });
        });
    }
    // Issue coupon directly to a customer (personalized coupons)
    issueCouponToCustomer(customerId, couponId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify coupon exists
            const coupon = yield prisma_1.prisma.coupon.findUnique({
                where: { id: couponId },
            });
            if (!coupon) {
                throw new Error('Coupon campaign not found');
            }
            // Verify if already issued to this customer and not redeemed
            const existing = yield prisma_1.prisma.customerCoupon.findFirst({
                where: { customerId, couponId, isRedeemed: false },
            });
            if (existing) {
                return existing; // already issued
            }
            return prisma_1.prisma.customerCoupon.create({
                data: {
                    couponId,
                    customerId,
                    isRedeemed: false,
                },
            });
        });
    }
    // Fetch all coupons issued to a customer (available for checkout)
    getCustomerAvailableCoupons(customerId, brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            return prisma_1.prisma.customerCoupon.findMany({
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
        });
    }
    // Validate and redeem a coupon on checkouts
    validateAndRedeem(customerId, couponCode, orderAmount, orderId, tx) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = tx || prisma_1.prisma;
            const now = new Date();
            // 1. Find coupon template
            const coupon = yield client.coupon.findFirst({
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
            const issuance = yield client.customerCoupon.findFirst({
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
            if (coupon.discountType === client_1.CouponDiscountType.FIXED) {
                discountAmount = coupon.discountValue;
            }
            else if (coupon.discountType === client_1.CouponDiscountType.PERCENTAGE) {
                discountAmount = (orderAmount * coupon.discountValue) / 100;
                if (coupon.maxDiscountAmount) {
                    discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
                }
            }
            discountAmount = Math.min(discountAmount, orderAmount);
            // 5. Update issuance record to REDEEMED
            yield client.customerCoupon.update({
                where: { id: issuance.id },
                data: {
                    isRedeemed: true,
                    redeemedAt: now,
                    orderId,
                },
            });
            return { discountAmount };
        });
    }
}
exports.CouponService = CouponService;
//# sourceMappingURL=coupon.service.js.map