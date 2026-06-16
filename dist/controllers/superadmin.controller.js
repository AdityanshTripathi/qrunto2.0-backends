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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuperAdminController = void 0;
const prisma_1 = require("../lib/prisma");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_12345';
class SuperAdminController {
    // ─── GET /api/superadmin/dashboard-stats ──────────────────────────────────
    getDashboardStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const now = new Date();
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                // 1. Restaurants counts
                const totalRestaurants = yield prisma_1.prisma.restaurant.count();
                const activeRestaurants = yield prisma_1.prisma.restaurant.count({ where: { isActive: true } });
                const activeSubs = yield prisma_1.prisma.subscription.findMany({
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
                    }
                    else {
                        paidRestaurants++;
                    }
                });
                // 2. Revenue (Last 30 Days)
                const revenueAgg = yield prisma_1.prisma.payment.aggregate({
                    _sum: { amount: true },
                    where: {
                        status: 'SUCCESS',
                        paidAt: { gte: thirtyDaysAgo },
                    },
                });
                const monthlyRevenue = (_a = revenueAgg._sum.amount) !== null && _a !== void 0 ? _a : 0;
                // 3. Orders counts
                const totalOrders = yield prisma_1.prisma.order.count();
                const todayOrders = yield prisma_1.prisma.order.count({
                    where: { createdAt: { gte: todayStart } },
                });
                // 4. Averages
                const averageRevenuePerRest = activeRestaurants > 0 ? parseFloat((monthlyRevenue / activeRestaurants).toFixed(2)) : 0;
                // 5. Subscription growth / distribution
                const planDistribution = yield prisma_1.prisma.subscriptionPlan.findMany({
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
                const recentRestaurants = yield prisma_1.prisma.restaurant.findMany({
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
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── GET /api/superadmin/restaurants ──────────────────────────────────────
    getRestaurants(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const restaurants = yield prisma_1.prisma.restaurant.findMany({
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
                    restaurants: restaurants.map((r) => {
                        var _a, _b, _c, _d;
                        return ({
                            id: r.id,
                            name: r.name,
                            ownerName: r.owner.name,
                            ownerEmail: r.owner.email,
                            phone: r.phone,
                            address: r.address,
                            isActive: r.isActive,
                            createdAt: r.createdAt,
                            planName: (_b = (_a = r.subscriptions[0]) === null || _a === void 0 ? void 0 : _a.plan.name) !== null && _b !== void 0 ? _b : 'No active plan',
                            expiryDate: (_d = (_c = r.subscriptions[0]) === null || _c === void 0 ? void 0 : _c.endDate) !== null && _d !== void 0 ? _d : null,
                            stats: {
                                ordersCount: r._count.orders,
                                tablesCount: r._count.tables,
                                menuItemsCount: r._count.menuItems,
                            },
                        });
                    }),
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── PATCH /api/superadmin/restaurants/:id/toggle-status ──────────────────
    toggleRestaurantStatus(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = req.params['id'];
                const restaurant = yield prisma_1.prisma.restaurant.findUnique({ where: { id } });
                if (!restaurant) {
                    res.status(404).json({ error: 'Restaurant not found' });
                    return;
                }
                const updated = yield prisma_1.prisma.restaurant.update({
                    where: { id },
                    data: { isActive: !restaurant.isActive },
                });
                res.status(200).json({
                    message: `Restaurant ${updated.name} has been ${updated.isActive ? 'activated' : 'suspended'}!`,
                    restaurant: updated,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── POST /api/superadmin/restaurants/:id/login-as ────────────────────────
    generateLoginAsToken(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = req.params['id'];
                const restaurant = yield prisma_1.prisma.restaurant.findUnique({
                    where: { id },
                    include: { owner: true },
                });
                if (!restaurant) {
                    res.status(404).json({ error: 'Restaurant not found' });
                    return;
                }
                // Generate owner bypass JWT token
                const token = jsonwebtoken_1.default.sign({
                    id: restaurant.owner.id,
                    email: restaurant.owner.email,
                    role: client_1.UserRole.RESTAURANT_OWNER,
                    restaurantId: restaurant.id,
                }, JWT_SECRET, { expiresIn: '1h' });
                res.status(200).json({
                    token,
                    ownerName: restaurant.owner.name,
                    restaurantName: restaurant.name,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── POST /api/superadmin/plans ───────────────────────────────────────────
    createPlan(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { name, price, durationDays, maxTables, maxMenuItems, featuresJson } = req.body;
                if (!name || price === undefined || !durationDays) {
                    res.status(400).json({ error: 'Name, price, and duration are required' });
                    return;
                }
                const plan = yield prisma_1.prisma.subscriptionPlan.create({
                    data: {
                        name,
                        price: parseFloat(price),
                        durationDays: parseInt(durationDays),
                        maxTables: parseInt(maxTables || '10'),
                        maxMenuItems: parseInt(maxMenuItems || '50'),
                        featuresJson: featuresJson || null,
                    },
                });
                res.status(201).json({ message: 'Plan created successfully!', plan });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── PATCH /api/superadmin/plans/:id ──────────────────────────────────────
    updatePlan(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = req.params['id'];
                const { name, price, durationDays, maxTables, maxMenuItems, featuresJson, isActive } = req.body;
                const plan = yield prisma_1.prisma.subscriptionPlan.update({
                    where: { id },
                    data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (name ? { name } : {})), (price !== undefined ? { price: parseFloat(price) } : {})), (durationDays ? { durationDays: parseInt(durationDays) } : {})), (maxTables ? { maxTables: parseInt(maxTables) } : {})), (maxMenuItems ? { maxMenuItems: parseInt(maxMenuItems) } : {})), (featuresJson !== undefined ? { featuresJson } : {})), (isActive !== undefined ? { isActive } : {})),
                });
                res.status(200).json({ message: 'Plan updated successfully!', plan });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── POST /api/superadmin/license-codes ───────────────────────────────────
    generateLicenseCode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { code, planId, durationDays, usageLimit, expiresAt } = req.body;
                if (!planId || !durationDays) {
                    res.status(400).json({ error: 'Subscription Plan and Duration are required' });
                    return;
                }
                // Generate a clean format if not provided, e.g. QR1M-XXXXXX
                let finalCode = code === null || code === void 0 ? void 0 : code.toUpperCase().trim();
                if (!finalCode) {
                    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
                    finalCode = `QR-${durationDays}D-${rand}`;
                }
                const plan = yield prisma_1.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
                if (!plan) {
                    res.status(404).json({ error: 'Subscription Plan not found' });
                    return;
                }
                const newCode = yield prisma_1.prisma.promoCode.create({
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
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── GET /api/superadmin/license-codes ────────────────────────────────────
    listLicenseCodes(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const codes = yield prisma_1.prisma.promoCode.findMany({
                    include: {
                        plan: { select: { name: true } },
                        _count: { select: { redemptions: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                });
                res.status(200).json({
                    codes: codes.map((c) => {
                        var _a, _b;
                        return ({
                            id: c.id,
                            code: c.code,
                            planName: (_b = (_a = c.plan) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Generic Promo',
                            durationDays: c.durationDays,
                            usageLimit: c.usageLimit,
                            usageCount: c.usageCount,
                            redemptionsCount: c._count.redemptions,
                            expiresAt: c.expiresAt,
                            isActive: c.isActive,
                            createdAt: c.createdAt,
                        });
                    }),
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── GET /api/superadmin/transactions ─────────────────────────────────────
    getTransactions(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const payments = yield prisma_1.prisma.payment.findMany({
                    include: {
                        restaurant: { select: { name: true } },
                        order: { select: { orderNumber: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                });
                res.status(200).json({
                    payments: payments.map((p) => {
                        var _a, _b;
                        return ({
                            id: p.id,
                            restaurantName: p.restaurant.name,
                            orderNumber: (_b = (_a = p.order) === null || _a === void 0 ? void 0 : _a.orderNumber) !== null && _b !== void 0 ? _b : 'N/A',
                            amount: p.amount,
                            status: p.status,
                            paymentMethod: p.paymentMethod,
                            paidAt: p.paidAt,
                            createdAt: p.createdAt,
                        });
                    }),
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── DELETE /api/superadmin/restaurants/:id ──────────────────────────────
    deleteRestaurant(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = req.params['id'];
                const restaurant = yield prisma_1.prisma.restaurant.findUnique({
                    where: { id },
                    include: { owner: true }
                });
                if (!restaurant) {
                    res.status(404).json({ error: 'Restaurant not found' });
                    return;
                }
                const ownerId = restaurant.ownerId;
                // Delete the restaurant (cascading deletes categories, menu items, orders, tables, subscriptions, settings)
                yield prisma_1.prisma.restaurant.delete({
                    where: { id }
                });
                // If the owner has no other restaurants, delete the owner user account
                if (ownerId) {
                    const otherRestCount = yield prisma_1.prisma.restaurant.count({
                        where: { ownerId }
                    });
                    if (otherRestCount === 0) {
                        yield prisma_1.prisma.user.delete({
                            where: { id: ownerId }
                        });
                    }
                }
                res.status(200).json({ message: `Restaurant ${restaurant.name} and its associated records have been deleted successfully!` });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── DELETE /api/superadmin/plans/:id ─────────────────────────────────────
    deletePlan(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = req.params['id'];
                const plan = yield prisma_1.prisma.subscriptionPlan.findUnique({
                    where: { id }
                });
                if (!plan) {
                    res.status(404).json({ error: 'Subscription plan not found' });
                    return;
                }
                // Delete inside transaction to clean up referenced Subscriptions and PromoCodes
                yield prisma_1.prisma.$transaction([
                    prisma_1.prisma.subscription.deleteMany({ where: { planId: id } }),
                    prisma_1.prisma.promoCode.deleteMany({ where: { planId: id } }),
                    prisma_1.prisma.subscriptionPlan.delete({ where: { id } })
                ]);
                res.status(200).json({ message: `Subscription plan ${plan.name} deleted successfully!` });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── DELETE /api/superadmin/license-codes/:id ─────────────────────────────
    deleteLicenseCode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = req.params['id'];
                const code = yield prisma_1.prisma.promoCode.findUnique({
                    where: { id }
                });
                if (!code) {
                    res.status(404).json({ error: 'License code not found' });
                    return;
                }
                // Deleting a PromoCode cascades to PromoRedemptions
                yield prisma_1.prisma.promoCode.delete({
                    where: { id }
                });
                res.status(200).json({ message: `License code ${code.code} deleted successfully!` });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── GET /api/superadmin/passcode-resets ──────────────────────────────────
    getPasscodeResets(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const requests = yield prisma_1.prisma.passcodeResetRequest.findMany({
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
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── PATCH /api/superadmin/passcode-resets/:id/action ───────────────────────
    handlePasscodeReset(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const id = req.params['id'];
                const { action } = req.body; // 'approve' | 'reject'
                if (action !== 'approve' && action !== 'reject') {
                    res.status(400).json({ error: "Invalid action. Must be 'approve' or 'reject'." });
                    return;
                }
                const request = yield prisma_1.prisma.passcodeResetRequest.findUnique({
                    where: { id },
                });
                if (!request) {
                    res.status(404).json({ error: 'Passcode reset request not found.' });
                    return;
                }
                if (request.status !== client_1.PasscodeResetStatus.PENDING) {
                    res.status(400).json({ error: `Cannot process request in ${request.status} status.` });
                    return;
                }
                const newStatus = action === 'approve' ? client_1.PasscodeResetStatus.APPROVED : client_1.PasscodeResetStatus.REJECTED;
                const updated = yield prisma_1.prisma.passcodeResetRequest.update({
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
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.SuperAdminController = SuperAdminController;
//# sourceMappingURL=superadmin.controller.js.map