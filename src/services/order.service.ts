import { OrderRepository, OrderWithDetails } from '../repositories/order.repository';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { LoyaltyService } from './crm/loyalty.service';
import { DeductionQueueService } from './inventory/deduction-queue.service';

const orderRepository = new OrderRepository();

// Valid status transitions
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.PREPARING, OrderStatus.CANCELLED, OrderStatus.ACCEPTED],
  ACCEPTED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.SERVED, OrderStatus.CANCELLED, OrderStatus.PAID],
  SERVED: [OrderStatus.PAID],
  PAID: [],
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
    let triggerDeduction = false;
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, restaurantId },
        include: { table: true, orderItems: true },
      });
      if (!order) throw new Error('Order not found or unauthorized');

      // Validate transition
      const allowed = ALLOWED_TRANSITIONS[order.status];
      if (!allowed.includes(newStatus)) {
        throw new Error(
          `Invalid status transition: cannot move from "${order.status}" to "${newStatus}"`
        );
      }

      // Update status
      await tx.order.update({
        where: { id },
        data: { status: newStatus },
      });

      if (newStatus === OrderStatus.PAID) {
        triggerDeduction = true;
      }

      // Loyalty triggers
      if (newStatus === OrderStatus.PAID && order.customerId) {
        const restaurant = await tx.restaurant.findUnique({
          where: { id: restaurantId },
          select: { brandId: true },
        });
        if (restaurant?.brandId) {
          const loyaltyService = new LoyaltyService();
          await loyaltyService.earnPoints(order.customerId, restaurant.brandId, order.totalAmount, order.id, tx);
        }
      } else if (newStatus === OrderStatus.CANCELLED) {
        const loyaltyService = new LoyaltyService();
        await loyaltyService.refundPointsForOrder(order.id, tx);
      }

      // Re-fetch order with details
      const updated = await tx.order.findFirst({
        where: { id, restaurantId },
        include: { table: true, orderItems: true },
      });
      if (!updated) throw new Error('Order not found after update');
      return updated as unknown as OrderWithDetails;
    });

    if (triggerDeduction) {
      DeductionQueueService.enqueueDeduction(id, restaurantId);
    }

    return result;
  }

  async applyLoyaltyDiscount(id: string, restaurantId: string, pointsToRedeem: number): Promise<OrderWithDetails> {
    if (pointsToRedeem <= 0) {
      throw new Error('Points to redeem must be greater than zero');
    }

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, restaurantId },
        include: { table: true, orderItems: true },
      });
      
      if (!order) throw new Error('Order not found or unauthorized');
      if (order.status === 'PAID' || order.status === 'CANCELLED') {
        throw new Error('Cannot apply loyalty discount to a paid or cancelled order');
      }
      if (!order.customerId) {
        throw new Error('Order is not linked to a customer profile');
      }

      // 1. Verify points balance
      const account = await tx.loyaltyAccount.findUnique({
        where: { customerId: order.customerId }
      });
      if (!account || account.pointsBalance < pointsToRedeem) {
        throw new Error(`Insufficient points. Balance: ${account?.pointsBalance || 0}, Required: ${pointsToRedeem}`);
      }

      // 2. Calculate discount (1 point = ₹1)
      const discount = Math.min(order.totalAmount, pointsToRedeem);
      const newTotalAmount = parseFloat((order.totalAmount - discount).toFixed(2));
      
      // Append note to order
      const orderNotes = `${order.notes || ''} [POS Redeemed ${pointsToRedeem} points, ₹${discount} discount]`.trim();

      // 3. Update order
      await tx.order.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          notes: orderNotes,
        },
      });

      // 4. Deduct points from loyalty account
      const loyaltyService = new LoyaltyService();
      await loyaltyService.redeemPoints(order.customerId, pointsToRedeem, order.id, tx);

      // Re-fetch order
      const updated = await tx.order.findFirst({
        where: { id, restaurantId },
        include: { table: true, orderItems: true },
      });
      if (!updated) throw new Error('Order not found after update');
      return updated as unknown as OrderWithDetails;
    });
  }

  async payOrder(id: string, restaurantId: string, paymentMethod: string): Promise<OrderWithDetails> {
    let triggerDeduction = false;
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, restaurantId },
        include: { table: true, orderItems: true },
      });
      if (!order) throw new Error('Order not found or unauthorized');

      if (order.status === OrderStatus.PAID) {
        return order as unknown as OrderWithDetails;
      }

      // 1. Create Payment record
      const newPayment = await tx.payment.create({
        data: {
          restaurantId,
          orderId: order.id,
          amount: order.totalAmount,
          status: 'SUCCESS',
          paymentMethod: paymentMethod || 'CASH',
          paidAt: new Date(),
        },
      });

      // 2. Create Transaction record
      await tx.transaction.create({
        data: {
          restaurantId,
          paymentId: newPayment.id,
          amount: order.totalAmount,
          transactionType: 'INCOME',
          reference: `Waiter Settle: ${paymentMethod}`,
        },
      });

      // 3. Update Order status to PAID
      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.PAID },
      });
      triggerDeduction = true;

      // 4. Earn loyalty points
      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { brandId: true },
      });
      if (order.customerId && restaurant?.brandId) {
        const loyaltyService = new LoyaltyService();
        await loyaltyService.earnPoints(order.customerId, restaurant.brandId, order.totalAmount, order.id, tx);
      }

      // Re-fetch order with details
      const updated = await tx.order.findFirst({
        where: { id, restaurantId },
        include: { table: true, orderItems: true },
      });
      if (!updated) throw new Error('Order not found after update');
      return updated as unknown as OrderWithDetails;
    });

    if (triggerDeduction) {
      DeductionQueueService.enqueueDeduction(id, restaurantId);
    }

    return result;
  }
}
