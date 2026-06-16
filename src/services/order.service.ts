import { OrderRepository, OrderWithDetails } from '../repositories/order.repository';
import { OrderStatus } from '@prisma/client';

const orderRepository = new OrderRepository();

// Valid status transitions
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.SERVED, OrderStatus.CANCELLED],
  SERVED: [],
  CANCELLED: [],
};

export class OrderService {
  async getOrders(
    restaurantId: string,
    filters?: { status?: OrderStatus; date?: Date }
  ): Promise<OrderWithDetails[]> {
    return orderRepository.findMany(restaurantId, filters);
  }

  async getOrderById(id: string, restaurantId: string): Promise<OrderWithDetails | null> {
    return orderRepository.findById(id, restaurantId);
  }

  async getOrderStats(restaurantId: string): Promise<Record<string, number>> {
    return orderRepository.countByStatus(restaurantId);
  }

  async updateOrderStatus(id: string, restaurantId: string, newStatus: OrderStatus): Promise<OrderWithDetails> {
    const order = await orderRepository.findById(id, restaurantId);
    if (!order) throw new Error('Order not found or unauthorized');

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: cannot move from "${order.status}" to "${newStatus}"`
      );
    }

    return orderRepository.updateStatus(id, restaurantId, newStatus);
  }
}
