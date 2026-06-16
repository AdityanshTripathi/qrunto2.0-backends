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
exports.AnalyticsController = void 0;
const prisma_1 = require("../lib/prisma");
class AnalyticsController {
    getOverview(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant linked to this session' });
                    return;
                }
                // 1. Core KPIs (only include SERVED orders for actual completed revenue)
                const servedOrders = yield prisma_1.prisma.order.findMany({
                    where: { restaurantId, status: 'SERVED' },
                    select: { totalAmount: true },
                });
                const totalRevenue = servedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
                const totalOrdersCount = servedOrders.length;
                const averageOrderValue = totalOrdersCount > 0 ? parseFloat((totalRevenue / totalOrdersCount).toFixed(2)) : 0;
                // 2. Active Tables Count
                const activeTablesCount = yield prisma_1.prisma.restaurantTable.count({
                    where: { restaurantId, isActive: true },
                });
                // 3. Sales Trend - past 7 days
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
                sevenDaysAgo.setHours(0, 0, 0, 0);
                const recentOrders = yield prisma_1.prisma.order.findMany({
                    where: {
                        restaurantId,
                        status: 'SERVED',
                        createdAt: { gte: sevenDaysAgo },
                    },
                    select: { totalAmount: true, createdAt: true },
                    orderBy: { createdAt: 'asc' },
                });
                // Map to past 7 dates
                const dailyTrend = {};
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const dayStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const key = d.toISOString().split('T')[0];
                    dailyTrend[key] = { date: dayStr, revenue: 0, count: 0 };
                }
                recentOrders.forEach((o) => {
                    const key = o.createdAt.toISOString().split('T')[0];
                    if (dailyTrend[key]) {
                        dailyTrend[key].revenue = parseFloat((dailyTrend[key].revenue + o.totalAmount).toFixed(2));
                        dailyTrend[key].count += 1;
                    }
                });
                const trendData = Object.values(dailyTrend);
                // 4. Top Selling Items
                const orderItemsGrouped = yield prisma_1.prisma.orderItem.groupBy({
                    by: ['itemName', 'menuItemId'],
                    where: {
                        order: {
                            restaurantId,
                            status: 'SERVED',
                        },
                    },
                    _sum: {
                        quantity: true,
                        totalPrice: true,
                    },
                    orderBy: {
                        _sum: {
                            quantity: 'desc',
                        },
                    },
                    take: 5,
                });
                const topSellingItems = orderItemsGrouped.map((item) => {
                    var _a, _b;
                    return ({
                        name: item.itemName,
                        quantity: (_a = item._sum.quantity) !== null && _a !== void 0 ? _a : 0,
                        revenue: (_b = item._sum.totalPrice) !== null && _b !== void 0 ? _b : 0,
                    });
                });
                // 5. Table Performance
                const tableOrdersGrouped = yield prisma_1.prisma.order.groupBy({
                    by: ['tableId'],
                    where: {
                        restaurantId,
                        status: 'SERVED',
                    },
                    _sum: {
                        totalAmount: true,
                    },
                    _count: {
                        id: true,
                    },
                    orderBy: {
                        _sum: {
                            totalAmount: 'desc',
                        },
                    },
                    take: 5,
                });
                // Fetch table numbers for the IDs
                const tableIds = tableOrdersGrouped.map((t) => t.tableId);
                const tables = yield prisma_1.prisma.restaurantTable.findMany({
                    where: { id: { in: tableIds } },
                    select: { id: true, tableNumber: true },
                });
                const tablePerformance = tableOrdersGrouped.map((group) => {
                    var _a, _b;
                    const table = tables.find((t) => t.id === group.tableId);
                    return {
                        tableNumber: (_a = table === null || table === void 0 ? void 0 : table.tableNumber) !== null && _a !== void 0 ? _a : 'Unknown',
                        ordersCount: group._count.id,
                        revenue: (_b = group._sum.totalAmount) !== null && _b !== void 0 ? _b : 0,
                    };
                });
                res.status(200).json({
                    kpis: {
                        totalRevenue,
                        totalOrdersCount,
                        averageOrderValue,
                        activeTablesCount,
                    },
                    trendData,
                    topSellingItems,
                    tablePerformance,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.AnalyticsController = AnalyticsController;
//# sourceMappingURL=analytics.controller.js.map