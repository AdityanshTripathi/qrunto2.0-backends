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
exports.AIGatewayController = void 0;
const prisma_1 = require("../../lib/prisma");
const zod_1 = require("zod");
const UpdateSummarySchema = zod_1.z.object({
    aiSummary: zod_1.z.string().min(5, 'Summary must be at least 5 characters').max(2000),
});
class AIGatewayController {
    // Search customers for AI integration
    searchCustomers(req, res) {
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
                const query = req.query['query'] || '';
                const customers = yield prisma_1.prisma.customer.findMany({
                    where: {
                        brandId,
                        OR: [
                            { name: { contains: query, mode: 'insensitive' } },
                            { phone: { contains: query } },
                            { email: { contains: query, mode: 'insensitive' } },
                        ],
                    },
                    include: {
                        profiles: {
                            select: {
                                totalSpend: true,
                                totalOrders: true,
                                aov: true,
                                lastVisit: true,
                                repeatStatus: true,
                            },
                        },
                    },
                    take: 50,
                });
                res.status(200).json({ customers });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Save/Update AI summary of customer
    updateCustomerSummary(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const customerId = req.params['id'];
                if (!user || !customerId) {
                    res.status(400).json({ error: 'Invalid parameters' });
                    return;
                }
                const validation = UpdateSummarySchema.safeParse(req.body);
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
                // Verify customer brand context
                const customer = yield prisma_1.prisma.customer.findFirst({
                    where: { id: customerId, brandId },
                });
                if (!customer) {
                    res.status(404).json({ error: 'Customer not found or unauthorized' });
                    return;
                }
                const updatedCustomer = yield prisma_1.prisma.customer.update({
                    where: { id: customerId },
                    data: { aiSummary: validation.data.aiSummary },
                });
                res.status(200).json({
                    message: 'AI summary updated successfully',
                    aiSummary: updatedCustomer.aiSummary,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Get segment distributions details for AI planning
    getSegmentsOverview(req, res) {
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
                const segments = yield prisma_1.prisma.segment.findMany({
                    where: { brandId },
                    include: {
                        _count: {
                            select: { customers: true },
                        },
                    },
                });
                res.status(200).json({ segments });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Get loyalty points aggregate values for AI analytics
    getLoyaltyOverview(req, res) {
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
                const tiers = yield prisma_1.prisma.loyaltyTier.findMany({
                    where: { brandId },
                    include: {
                        _count: {
                            select: { profiles: true },
                        },
                    },
                });
                const accounts = yield prisma_1.prisma.loyaltyAccount.findMany({
                    where: {
                        customer: { brandId },
                    },
                });
                const totalPoints = accounts.reduce((acc, curr) => acc + curr.pointsBalance, 0);
                const averagePoints = accounts.length > 0 ? totalPoints / accounts.length : 0;
                res.status(200).json({
                    totalLoyaltyMembers: accounts.length,
                    totalPointsHeld: totalPoints,
                    averagePointsPerMember: parseFloat(averagePoints.toFixed(1)),
                    tiersDistribution: tiers,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.AIGatewayController = AIGatewayController;
//# sourceMappingURL=ai-gateway.controller.js.map