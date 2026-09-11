import {
  OrderFilters,
  OrderPagination,
  OrderRepository,
  OrderWithDetails,
  PaginatedOrders,
} from '../repositories/order.repository';
import { OrderStatus, Prisma } from '@prisma/client';
import { decimal, money, moneyNumber } from '../lib/money';
import { prisma } from '../lib/prisma';
import { LoyaltyService } from './crm/loyalty.service';
import { ProfilerService } from './crm/profiler.service';
import { DeductionQueueService } from './inventory/deduction-queue.service';
import { serializableTransaction } from '../lib/serializable-transaction';

const orderRepository = new OrderRepository();
async function ensureCashInvoice(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    restaurantId: string;
    orderNumber: string;
    subtotal: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  },
): Promise<void> {
  const settings = await tx.restaurantSetting.findUnique({
    where: { restaurantId: order.restaurantId },
    select: { invoiceSeries: true },
  });

  const series = settings?.invoiceSeries?.trim() || 'INV';
  const orderSuffix = order.orderNumber.replace(/^ORD-/, '');
  const invoiceNumber = `${series}-${orderSuffix}`;

  const discountValue = decimal(order.subtotal)
    .plus(order.taxAmount)
    .minus(order.totalAmount);

  const discount = moneyNumber(
    money(discountValue.gt(0) ? discountValue : decimal(0))
  );

  await tx.invoice.upsert({
    where: { orderId: order.id },
    update: {
      invoiceNumber,
      subtotal: order.subtotal,
      discount,
      gst: order.taxAmount,
      grandTotal: order.totalAmount,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
    },
    create: {
      restaurantId: order.restaurantId,
      orderId: order.id,
      invoiceNumber,
      subtotal: order.subtotal,
      discount,
      gst: order.taxAmount,
      grandTotal: order.totalAmount,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
    },
  });

  await tx.order.updateMany({
    where: {
      id: order.id,
      restaurantId: order.restaurantId,
    },
    data: { invoiceNumber },
  });
}

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
    filters: OrderFilters,
    pagination: OrderPagination,
  ): Promise<PaginatedOrders> {
    return orderRepository.findMany(restaurantId, filters, pagination);
  }

  async getOrderById(id: string, restaurantId: string): Promise<OrderWithDetails | null> {
    return orderRepository.findById(id, restaurantId);
  }

  async getInvoice(id: string, restaurantId: string) {
    return prisma.invoice.findFirst({
      where: {
        orderId: id,
        restaurantId,
        order: { restaurantId },
      },
    });
  }
  async getOrderStats(restaurantId: string): Promise<Record<string, number>> {
    return orderRepository.countByStatus(restaurantId);
  }

  async updateOrderStatus(id: string, restaurantId: string, newStatus: OrderStatus): Promise<OrderWithDetails> {
    if (newStatus === OrderStatus.PAID) throw new Error('Use the cash settlement endpoint to record payment');
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
      const update = await tx.order.updateMany({
        where: { id, restaurantId, status: order.status },
        data: { status: newStatus },
      });
      if (update.count !== 1) throw new Error('Order not found or unauthorized');

      if (newStatus === OrderStatus.CANCELLED) {
        const loyaltyService = new LoyaltyService();
        await loyaltyService.refundPointsForOrder(order.id, tx);
      }

      // Re-fetch order with details
      const updated = await tx.order.findFirst({
        where: { id, restaurantId },
        include: {
          table: true,
          orderItems: true,
          payments: true,
          invoice: true,
        },
      });
      if (!updated) throw new Error('Order not found after update');
      return updated as unknown as OrderWithDetails;
    });

    return result;
  }

  async applyLoyaltyDiscount(id: string, restaurantId: string, pointsToRedeem: number): Promise<OrderWithDetails> {
    if (!Number.isSafeInteger(pointsToRedeem) || pointsToRedeem <= 0) {
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

      if (decimal(order.totalAmount).lt(pointsToRedeem)) throw new Error('Points cannot exceed the payable amount');
      const redeemed = await tx.loyaltyLedger.findFirst({ where: { orderId: id, transactionType: 'REDEMPTION' } });
      if (redeemed) throw new Error('Loyalty discount already applied to this order');

      // 1. Verify points balance
      const account = await tx.loyaltyAccount.findUnique({
        where: { customerId: order.customerId }
      });
      if (!account || account.pointsBalance < pointsToRedeem) {
        throw new Error(`Insufficient points. Balance: ${account?.pointsBalance || 0}, Required: ${pointsToRedeem}`);
      }

      // 2. Calculate discount (1 point = ₹1)
      const discount = moneyNumber(decimal(order.totalAmount).lt(pointsToRedeem) ? order.totalAmount : pointsToRedeem);
      const newTotalAmount = moneyNumber(money(decimal(order.totalAmount).minus(discount)));
      
      // Append note to order
      const orderNotes = `${order.notes || ''} [POS Redeemed ${pointsToRedeem} points, ₹${discount} discount]`.trim();

      // 3. Update order
      const update = await tx.order.updateMany({
        where: { id, restaurantId, status: order.status, totalAmount: order.totalAmount },
        data: {
          totalAmount: newTotalAmount,
          notes: orderNotes,
        },
      });
      if (update.count !== 1) throw new Error('Order not found or unauthorized');

      // 4. Deduct points from loyalty account
      const loyaltyService = new LoyaltyService();
      await loyaltyService.redeemPoints(order.customerId, pointsToRedeem, order.id, tx);

      // Re-fetch order
      const updated = await tx.order.findFirst({
        where: { id, restaurantId },
        include: {
          table: true,
          orderItems: true,
          payments: true,
          invoice: true,
        },
      });
      if (!updated) throw new Error('Order not found after update');
      return updated as unknown as OrderWithDetails;
    });
  }

  async payOrder(id: string, restaurantId: string, paymentMethod: string): Promise<OrderWithDetails> {
    // Staff can attest cash receipt; electronic methods require a provider that is not configured.
    if (paymentMethod !== 'CASH') throw new Error('Only cash settlement is available');
    let triggerDeduction = false;
    const result = await serializableTransaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, restaurantId },
        include: { table: true, orderItems: true },
      });
      if (!order) throw new Error('Order not found or unauthorized');

      if (order.status === OrderStatus.CANCELLED) throw new Error('Cannot settle a cancelled order');
      if (decimal(order.totalAmount).lt(0)) throw new Error('Invalid order amount');
      // Existing partial/refunded payments require reconciliation, never another full charge.
      const existingPayments = await tx.payment.findMany({
        where: { orderId: id, restaurantId, status: { in: ['SUCCESS', 'REFUNDED'] } },
      });
      if (existingPayments.length > 1) throw new Error('Payment reconciliation required');
      const existing = existingPayments[0];
      if (existing && (existing.razorpayOrderId || existing.razorpayPaymentId || existing.paymentMethod !== 'CASH')) throw new Error('Payment reconciliation required');
      if (existing && (existing.status === 'REFUNDED' || decimal(existing.refundedAmount ?? 0).gt(0))) {
        throw new Error('Refunded payment cannot be settled again');
      }
      if (order.status === OrderStatus.PAID) {
        if (!existing || !decimal(existing.amount).eq(order.totalAmount)) throw new Error('Payment reconciliation required');

        await ensureCashInvoice(tx, order);

        triggerDeduction = true; // Retry the existing idempotent queue after a prior enqueue failure.

        const paidOrder = await tx.order.findFirst({
          where: { id, restaurantId },
          include: {
            table: true,
            orderItems: true,
            payments: true,
            invoice: true,
          },
        });

        if (!paidOrder) throw new Error('Order not found after invoice recovery');
        return paidOrder as unknown as OrderWithDetails;
      }

      if (existing) throw new Error('Payment reconciliation required');
      // Claim the order before financial writes. PostgreSQL rechecks this predicate after
      // waiting for a concurrent update; only one transaction can create the payment.
      const claim = await tx.order.updateMany({
        where: { id, restaurantId, status: order.status, totalAmount: order.totalAmount },
        data: { status: OrderStatus.PAID },
      });
      if (claim.count !== 1) {
        const current = await tx.order.findFirst({ where: { id, restaurantId }, include: { table: true, orderItems: true } });
        if (current?.status === OrderStatus.PAID) return current as unknown as OrderWithDetails;
        throw new Error('Order changed; reload before settling');
      }

      // 1. Create Payment record
      const newPayment = await tx.payment.create({
        data: {
          restaurantId,
          orderId: order.id,
          amount: order.totalAmount,
          status: 'SUCCESS',
          paymentMethod: 'CASH',
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

      // Invoice is part of the same settlement transaction and is idempotent by orderId.
      await ensureCashInvoice(tx, order);
      // Persist inventory work in the SAME DB transaction as settlement.
      // If the process dies before Redis enqueue, startup/cron can recover it.
      await tx.auditLog.create({
        data: {
          action: 'INVENTORY_DEDUCTION_PENDING',
          entityType: 'ORDER',
          entityId: order.id,
          metadata: { restaurantId },
        },
      });

      triggerDeduction = true;

      // 4. Earn loyalty points
      if (order.customerId) await new ProfilerService().refreshPurchaseMetrics(order.customerId, restaurantId, tx);
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
        include: {
          table: true,
          orderItems: true,
          payments: true,
          invoice: true,
        },
      });
      if (!updated) throw new Error('Order not found after update');
      return updated as unknown as OrderWithDetails;
    });

    if (triggerDeduction) {
      await DeductionQueueService.enqueueDeduction(id, restaurantId);
    }

    return result;
  }
}
