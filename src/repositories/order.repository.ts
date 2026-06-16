import { prisma } from '../lib/prisma';
import { Order, OrderStatus, OrderItem, RestaurantTable } from '@prisma/client';

export type OrderWithDetails = Order & {
  table: RestaurantTable;
  orderItems: OrderItem[];
};

export class OrderRepository {
  async findMany(
    restaurantId: string,
    filters?: { status?: OrderStatus; date?: Date }
  ): Promise<OrderWithDetails[]> {
    const where: Record<string, unknown> = { restaurantId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    return prisma.order.findMany({
      where,
      include: { table: true, orderItems: true },
      orderBy: { createdAt: 'desc' },
    }) as Promise<OrderWithDetails[]>;
  }

  async findById(id: string, restaurantId: string): Promise<OrderWithDetails | null> {
    return prisma.order.findFirst({
      where: { id, restaurantId },
      include: { table: true, orderItems: true },
    }) as Promise<OrderWithDetails | null>;
  }

  async countByStatus(restaurantId: string): Promise<Record<string, number>> {
    const counts = await prisma.order.groupBy({
      by: ['status'],
      where: { restaurantId },
      _count: { status: true },
    });

    const result: Record<string, number> = {
      NEW: 0, PREPARING: 0, READY: 0, SERVED: 0, CANCELLED: 0,
    };
    counts.forEach(({ status, _count }) => {
      result[status] = _count.status;
    });
    return result;
  }

  async updateStatus(id: string, restaurantId: string, status: OrderStatus): Promise<OrderWithDetails> {
    await prisma.order.updateMany({
      where: { id, restaurantId },
      data: { status },
    });
    const updated = await this.findById(id, restaurantId);
    if (!updated) throw new Error('Order not found');
    return updated;
  }
}
