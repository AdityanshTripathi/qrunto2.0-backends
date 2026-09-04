import { prisma } from '../../lib/prisma';
import { LedgerActionType, RawMaterialStatus } from '@prisma/client';

export class ReportService {
  async getDashboardMetrics(restaurantId: string): Promise<any> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [rawMaterials, ledgersToday, receivedPOsToday, wastageToday] = await Promise.all([
      prisma.rawMaterial.findMany({
        where: { restaurantId, status: RawMaterialStatus.ACTIVE },
      }),
      prisma.stockLedger.findMany({
        where: {
          restaurantId,
          actionType: LedgerActionType.SALE_DEDUCTION,
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
      }),
      prisma.purchaseOrder.findMany({
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
      }),
      prisma.wastageRecord.aggregate({
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
      }),
    ]);

    const totalItems = rawMaterials.length;
    let totalValue = 0;
    let lowStockItems = 0;
    let outOfStockItems = 0;

    for (const rm of rawMaterials) {
      totalValue += rm.currentStock * rm.averageCost;
      if (rm.currentStock <= rm.minimumStockLevel) lowStockItems++;
      if (rm.currentStock <= 0) outOfStockItems++;
    }

    const stockHealthScore = totalItems > 0
      ? Math.max(0, Math.round((1 - (lowStockItems + outOfStockItems) / totalItems) * 100))
      : 100;

    let todayConsumption = 0;
    for (const entry of ledgersToday) {
      const avgCost = entry.rawMaterial?.averageCost || 0;
      todayConsumption += Math.abs(entry.quantity) * avgCost;
    }

    let todayPurchases = 0;
    for (const po of receivedPOsToday) {
      for (const item of po.items) {
        todayPurchases += item.quantity * item.unitPrice;
      }
    }

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
  }

  async getConsumptionAnalytics(
    restaurantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    // Get all SALE_DEDUCTION ledger lines in date range
    const ledgers = await prisma.stockLedger.findMany({
      where: {
        restaurantId,
        actionType: LedgerActionType.SALE_DEDUCTION,
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
    const dailyData: Record<string, number> = {};
    const itemData: Record<string, number> = {};

    for (const entry of ledgers) {
      const dateStr = entry.createdAt.toISOString().slice(0, 10);
      const avgCost = entry.rawMaterial?.averageCost || 0;
      const cost = Math.abs(entry.quantity) * avgCost;

      dailyData[dateStr] = (dailyData[dateStr] || 0) + cost;

      const itemName = entry.rawMaterial?.name || 'Unknown';
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
  }
}
