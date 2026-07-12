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
exports.LoyaltyController = void 0;
const prisma_1 = require("../../lib/prisma");
const zod_1 = require("zod");
const LoyaltyTierSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required').max(50),
    minSpend: zod_1.z.number().nonnegative('Minimum spend must be a non-negative number'),
    multiplier: zod_1.z.number().positive('Multiplier must be greater than 0'),
});
class LoyaltyController {
    // Fetch loyalty tiers for the owner's brand
    getTiers(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                if (!user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                // Get brand context
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found for this account' });
                    return;
                }
                const tiers = yield prisma_1.prisma.loyaltyTier.findMany({
                    where: { brandId },
                    orderBy: { minSpend: 'asc' },
                });
                res.status(200).json({ tiers });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Create or update a loyalty tier
    upsertTier(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const tierId = req.params['id']; // optional id in path for edit
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
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found for this account' });
                    return;
                }
                let tier;
                if (tierId) {
                    // Update existing tier
                    // Multi-tenant verify
                    const existing = yield prisma_1.prisma.loyaltyTier.findFirst({
                        where: { id: tierId, brandId },
                    });
                    if (!existing) {
                        res.status(404).json({ error: 'Loyalty tier not found or unauthorized' });
                        return;
                    }
                    tier = yield prisma_1.prisma.loyaltyTier.update({
                        where: { id: tierId },
                        data: {
                            name,
                            minSpend,
                            multiplier,
                        },
                    });
                }
                else {
                    // Create new tier
                    // Check if name is unique under this brand
                    const duplicate = yield prisma_1.prisma.loyaltyTier.findFirst({
                        where: { brandId, name: { equals: name, mode: 'insensitive' } },
                    });
                    if (duplicate) {
                        res.status(400).json({ error: `A loyalty tier with the name "${name}" already exists` });
                        return;
                    }
                    tier = yield prisma_1.prisma.loyaltyTier.create({
                        data: {
                            brandId,
                            name,
                            minSpend,
                            multiplier,
                        },
                    });
                }
                res.status(200).json({ message: 'Loyalty tier saved successfully', tier });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Delete loyalty tier
    deleteTier(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const tierId = req.params['id'];
                if (!user || !tierId) {
                    res.status(400).json({ error: 'Invalid request parameters' });
                    return;
                }
                // Get brand context
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                // Check tier belongs to brand
                const existing = yield prisma_1.prisma.loyaltyTier.findFirst({
                    where: { id: tierId, brandId },
                });
                if (!existing) {
                    res.status(404).json({ error: 'Loyalty tier not found or unauthorized' });
                    return;
                }
                // Delete tier
                yield prisma_1.prisma.loyaltyTier.delete({
                    where: { id: tierId },
                });
                res.status(200).json({ message: 'Loyalty tier deleted successfully' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Fetch loyalty details by phone number (authenticated)
    getBalanceByPhone(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
            try {
                const user = req.user;
                const phone = req.query['phone'];
                if (!user || !phone) {
                    res.status(400).json({ error: 'Phone number is required' });
                    return;
                }
                // Get brand context
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: {
                        restaurants: {
                            select: { id: true, brandId: true }
                        }
                    }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                const restaurantId = (_d = (_c = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.id;
                if (!brandId || !restaurantId) {
                    res.status(400).json({ error: 'No brand/restaurant context found' });
                    return;
                }
                const customer = yield prisma_1.prisma.customer.findFirst({
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
                const pointsBalance = ((_e = customer.loyaltyAccount) === null || _e === void 0 ? void 0 : _e.pointsBalance) || 0;
                const lifetimePoints = ((_f = customer.loyaltyAccount) === null || _f === void 0 ? void 0 : _f.lifetimePoints) || 0;
                const tierName = ((_j = (_h = (_g = customer.profiles) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.loyaltyTier) === null || _j === void 0 ? void 0 : _j.name) || null;
                const multiplier = ((_m = (_l = (_k = customer.profiles) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.loyaltyTier) === null || _m === void 0 ? void 0 : _m.multiplier) || 1.0;
                res.status(200).json({ pointsBalance, lifetimePoints, tierName, multiplier });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.LoyaltyController = LoyaltyController;
//# sourceMappingURL=loyalty.controller.js.map