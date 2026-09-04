import { prisma } from '../lib/prisma';
import { Order, OrderStatus, OrderItem, RestaurantTable, Payment } from '@prisma/client';

export type OrderWithDetails = Order & {
  table: RestaurantTable;
  orderItems: OrderItem[];
  payments: Payment[];
};

export interface OrderFilters {
  status?: OrderStatus;
  date?: Date;
  startDate?: Date;
  endDate?: Date;
}

export interface OrderPagination {
  cursor?: string;
  limit: number;
}

export interface PaginatedOrders {
  orders: OrderWithDetails[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export class OrderRepository {
  async findMany(
    restaurantId: string,
    filters: OrderFilters,
    pagination: OrderPagination,
  ): Promise<PaginatedOrders> {
    const where: Record<string, unknown> = { restaurantId };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    } else if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: filters.startDate } : {}),
        ...(filters.endDate ? { lte: filters.endDate } : {}),
      };
    }

    const results = await prisma.order.findMany({
      where,
      include: { table: true, orderItems: true, payments: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    }) as OrderWithDetails[];

    const hasMore = results.length > pagination.limit;
    const orders = hasMore ? results.slice(0, pagination.limit) : results;

    return {
      orders,
      pagination: {
        limit: pagination.limit,
        nextCursor: hasMore ? orders[orders.length - 1]?.id ?? null : null,
        hasMore,
      },
    };
  }

  async findById(id: string, restaurantId: string): Promise<OrderWithDetails | null> {
    return prisma.order.findFirst({
      where: { id, restaurantId },
      include: { table: true, orderItems: true, payments: true },
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
