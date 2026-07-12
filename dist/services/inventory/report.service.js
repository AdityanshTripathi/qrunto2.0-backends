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
exports.ReportService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class ReportService {
    getDashboardMetrics(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            // 1. Fetch all raw materials
            const rawMaterials = yield prisma_1.prisma.rawMaterial.findMany({
                where: { restaurantId, status: client_1.RawMaterialStatus.ACTIVE },
            });
            const totalItems = rawMaterials.length;
            let totalValue = 0;
            let lowStockItems = 0;
            let outOfStockItems = 0;
            for (const rm of rawMaterials) {
                totalValue += rm.currentStock * rm.averageCost;
                if (rm.currentStock <= rm.minimumStockLevel) {
                    lowStockItems++;
                }
                if (rm.currentStock <= 0) {
                    outOfStockItems++;
                }
            }
            // Stock Health Score = (1 - (Low Stock + Out of Stock) / Total Items) * 100
            const stockHealthScore = totalItems > 0
                ? Math.max(0, Math.round((1 - (lowStockItems + outOfStockItems) / totalItems) * 100))
                : 100;
            // 2. Today's Consumption: sum(abs(ledger.quantity) * averageCost) for SALE_DEDUCTION today
            // Wait, let's fetch ledger entries for SALE_DEDUCTION today
            const ledgersToday = yield prisma_1.prisma.stockLedger.findMany({
                where: {
                    restaurantId,
                    actionType: client_1.LedgerActionType.SALE_DEDUCTION,
                    createdAt: {
                        gte: todayStart,
                        lte: todayEnd,
                    },
                },
                include: {
                    rawMaterial: {
                        select: { averageCost: true },
                    },
                },
            });
            let todayConsumption = 0;
            for (const entry of ledgersToday) {
                const avgCost = ((_a = entry.rawMaterial) === null || _a === void 0 ? void 0 : _a.averageCost) || 0;
                todayConsumption += Math.abs(entry.quantity) * avgCost;
            }
            // 3. Today's Purchases: sum(poItem.quantity * poItem.unitPrice) for received POs today
            const receivedPOsToday = yield prisma_1.prisma.purchaseOrder.findMany({
                where: {
                    restaurantId,
                    status: 'RECEIVED',
                    receivedDate: {
                        gte: todayStart,
                        lte: todayEnd,
                    },
                },
                include: {
                    items: true,
                },
            });
            let todayPurchases = 0;
            for (const po of receivedPOsToday) {
                for (const item of po.items) {
                    todayPurchases += item.quantity * item.unitPrice;
                }
            }
            // 4. Today's Wastage: sum(waste.cost) recorded today
            const wastageToday = yield prisma_1.prisma.wastageRecord.aggregate({
                where: {
                    restaurantId,
                    wasteDate: {
                        gte: todayStart,
                        lte: todayEnd,
                    },
                },
                _sum: {
                    cost: true,
                },
            });
            const todayWastage = wastageToday._sum.cost || 0;
            return {
                totalValue: parseFloat(totalValue.toFixed(2)),
                totalItems,
                lowStockItems,
                outOfStockItems,
                todayConsumption: parseFloat(todayConsumption.toFixed(2)),
                todayPurchases: parseFloat(todayPurchases.toFixed(2)),
                todayWastage: parseFloat(todayWastage.toFixed(2)),
                stockHealthScore,
            };
        });
    }
    getConsumptionAnalytics(restaurantId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Get all SALE_DEDUCTION ledger lines in date range
            const ledgers = yield prisma_1.prisma.stockLedger.findMany({
                where: {
                    restaurantId,
                    actionType: client_1.LedgerActionType.SALE_DEDUCTION,
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                include: {
                    rawMaterial: {
                        select: {
                            name: true,
                            averageCost: true,
                        },
                    },
                },
                orderBy: { createdAt: 'asc' },
            });
            // Group by day and calculate total cost
            const dailyData = {};
            const itemData = {};
            for (const entry of ledgers) {
                const dateStr = entry.createdAt.toISOString().slice(0, 10);
                const avgCost = ((_a = entry.rawMaterial) === null || _a === void 0 ? void 0 : _a.averageCost) || 0;
                const cost = Math.abs(entry.quantity) * avgCost;
                dailyData[dateStr] = (dailyData[dateStr] || 0) + cost;
                const itemName = ((_b = entry.rawMaterial) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown';
                itemData[itemName] = (itemData[itemName] || 0) + cost;
            }
            // Format for charts
            const dailyConsumption = Object.entries(dailyData).map(([date, cost]) => ({
                date,
                cost: parseFloat(cost.toFixed(2)),
            }));
            const topConsumedItems = Object.entries(itemData)
                .map(([name, cost]) => ({
                name,
                cost: parseFloat(cost.toFixed(2)),
            }))
                .sort((a, b) => b.cost - a.cost)
                .slice(0, 10);
            return {
                dailyConsumption,
                topConsumedItems,
            };
        });
    }
}
exports.ReportService = ReportService;
//# sourceMappingURL=report.service.js.map