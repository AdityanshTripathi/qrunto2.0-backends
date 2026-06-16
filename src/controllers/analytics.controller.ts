import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export class AnalyticsController {
  async getOverview(req: Request, res: Response): Promise<void> {
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
      const servedOrders = await prisma.order.findMany({
        where: { restaurantId, status: 'SERVED' },
        select: { totalAmount: true },
      });

      const totalRevenue = servedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const totalOrdersCount = servedOrders.length;
      const averageOrderValue = totalOrdersCount > 0 ? parseFloat((totalRevenue / totalOrdersCount).toFixed(2)) : 0;

      // 2. Active Tables Count
      const activeTablesCount = await prisma.restaurantTable.count({
        where: { restaurantId, isActive: true },
      });

      // 3. Sales Trend - past 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const recentOrders = await prisma.order.findMany({
        where: {
          restaurantId,
          status: 'SERVED',
          createdAt: { gte: sevenDaysAgo },
        },
        select: { totalAmount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      // Map to past 7 dates
      const dailyTrend: Record<string, { date: string; revenue: number; count: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const key = d.toISOString().split('T')[0]!;
        dailyTrend[key] = { date: dayStr, revenue: 0, count: 0 };
      }

      recentOrders.forEach((o) => {
        const key = o.createdAt.toISOString().split('T')[0]!;
        if (dailyTrend[key]) {
          dailyTrend[key].revenue = parseFloat((dailyTrend[key].revenue + o.totalAmount).toFixed(2));
          dailyTrend[key].count += 1;
        }
      });

      const trendData = Object.values(dailyTrend);

      // 4. Top Selling Items
      const orderItemsGrouped = await prisma.orderItem.groupBy({
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

      const topSellingItems = orderItemsGrouped.map((item) => ({
        name: item.itemName,
        quantity: item._sum.quantity ?? 0,
        revenue: item._sum.totalPrice ?? 0,
      }));

      // 5. Table Performance
      const tableOrdersGrouped = await prisma.order.groupBy({
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
      const tables = await prisma.restaurantTable.findMany({
        where: { id: { in: tableIds } },
        select: { id: true, tableNumber: true },
      });

      const tablePerformance = tableOrdersGrouped.map((group) => {
        const table = tables.find((t) => t.id === group.tableId);
        return {
          tableNumber: table?.tableNumber ?? 'Unknown',
          ordersCount: group._count.id,
          revenue: group._sum.totalAmount ?? 0,
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
