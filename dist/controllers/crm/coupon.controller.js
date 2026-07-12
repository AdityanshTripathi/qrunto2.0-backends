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
exports.CouponController = void 0;
const prisma_1 = require("../../lib/prisma");
const coupon_service_1 = require("../../services/crm/coupon.service");
const zod_1 = require("zod");
const CreateCouponSchema = zod_1.z.object({
    code: zod_1.z.string().min(2, 'Code must be at least 2 characters').max(30),
    discountType: zod_1.z.enum(['PERCENTAGE', 'FIXED']),
    discountValue: zod_1.z.number().positive('Discount value must be greater than 0'),
    minOrderAmount: zod_1.z.number().nonnegative().optional(),
    maxDiscountAmount: zod_1.z.number().positive().optional().nullable(),
    startDate: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date'),
    endDate: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date'),
});
const couponService = new coupon_service_1.CouponService();
class CouponController {
    // Fetch coupons for owner's brand
    getCoupons(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                if (!user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: { restaurants: { select: { brandId: true } } }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const coupons = yield couponService.getCoupons(brandId);
                res.status(200).json({ coupons });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Create new coupon template
    createCoupon(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
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
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: { restaurants: { select: { brandId: true } } }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const coupon = yield couponService.createCoupon(brandId, {
                    code: validation.data.code,
                    discountType: validation.data.discountType,
                    discountValue: validation.data.discountValue,
                    minOrderAmount: (_c = validation.data.minOrderAmount) !== null && _c !== void 0 ? _c : 0,
                    maxDiscountAmount: (_d = validation.data.maxDiscountAmount) !== null && _d !== void 0 ? _d : null,
                    startDate: new Date(validation.data.startDate),
                    endDate: new Date(validation.data.endDate),
                });
                res.status(201).json({ message: 'Coupon created successfully', coupon });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Delete coupon template
    deleteCoupon(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const couponId = req.params['id'];
                if (!user || !couponId) {
                    res.status(400).json({ error: 'Invalid parameters' });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: { restaurants: { select: { brandId: true } } }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                yield couponService.deleteCoupon(brandId, couponId);
                res.status(200).json({ message: 'Coupon deleted successfully' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Issue coupon to customer
    issueCoupon(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const user = req.user;
                const { customerId, couponId } = req.body;
                if (!user || !customerId || !couponId) {
                    res.status(400).json({ error: 'Customer ID and Coupon ID are required' });
                    return;
                }
                const issuance = yield couponService.issueCouponToCustomer(customerId, couponId);
                res.status(200).json({ message: 'Coupon issued successfully', issuance });
            }
            catch (err) {
                res.status(505).json({ error: err.message });
            }
        });
    }
    // Get available customer coupons
    getCustomerCoupons(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const customerId = req.params['customerId'];
                if (!user || !customerId) {
                    res.status(400).json({ error: 'Customer ID is required' });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: { restaurants: { select: { brandId: true } } }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const coupons = yield couponService.getCustomerAvailableCoupons(customerId, brandId);
                res.status(200).json({ coupons });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.CouponController = CouponController;
//# sourceMappingURL=coupon.controller.js.map