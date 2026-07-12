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
exports.OrderService = void 0;
const order_repository_1 = require("../repositories/order.repository");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const loyalty_service_1 = require("./crm/loyalty.service");
const deduction_queue_service_1 = require("./inventory/deduction-queue.service");
const orderRepository = new order_repository_1.OrderRepository();
// Valid status transitions
const ALLOWED_TRANSITIONS = {
    NEW: [client_1.OrderStatus.PREPARING, client_1.OrderStatus.CANCELLED, client_1.OrderStatus.ACCEPTED],
    ACCEPTED: [client_1.OrderStatus.PREPARING, client_1.OrderStatus.CANCELLED],
    PREPARING: [client_1.OrderStatus.READY, client_1.OrderStatus.CANCELLED],
    READY: [client_1.OrderStatus.SERVED, client_1.OrderStatus.CANCELLED, client_1.OrderStatus.PAID],
    SERVED: [client_1.OrderStatus.PAID],
    PAID: [],
    CANCELLED: [],
};
class OrderService {
    getOrders(restaurantId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            return orderRepository.findMany(restaurantId, filters);
        });
    }
    getOrderById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return orderRepository.findById(id, restaurantId);
        });
    }
    getOrderStats(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return orderRepository.countByStatus(restaurantId);
        });
    }
    updateOrderStatus(id, restaurantId, newStatus) {
        return __awaiter(this, void 0, void 0, function* () {
            let triggerDeduction = false;
            const result = yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const order = yield tx.order.findFirst({
                    where: { id, restaurantId },
                    include: { table: true, orderItems: true },
                });
                if (!order)
                    throw new Error('Order not found or unauthorized');
                // Validate transition
                const allowed = ALLOWED_TRANSITIONS[order.status];
                if (!allowed.includes(newStatus)) {
                    throw new Error(`Invalid status transition: cannot move from "${order.status}" to "${newStatus}"`);
                }
                // Update status
                yield tx.order.update({
                    where: { id },
                    data: { status: newStatus },
                });
                if (newStatus === client_1.OrderStatus.PAID) {
                    triggerDeduction = true;
                }
                // Loyalty triggers
                if (newStatus === client_1.OrderStatus.PAID && order.customerId) {
                    const restaurant = yield tx.restaurant.findUnique({
                        where: { id: restaurantId },
                        select: { brandId: true },
                    });
                    if (restaurant === null || restaurant === void 0 ? void 0 : restaurant.brandId) {
                        const loyaltyService = new loyalty_service_1.LoyaltyService();
                        yield loyaltyService.earnPoints(order.customerId, restaurant.brandId, order.totalAmount, order.id, tx);
                    }
                }
                else if (newStatus === client_1.OrderStatus.CANCELLED) {
                    const loyaltyService = new loyalty_service_1.LoyaltyService();
                    yield loyaltyService.refundPointsForOrder(order.id, tx);
                }
                // Re-fetch order with details
                const updated = yield tx.order.findFirst({
                    where: { id, restaurantId },
                    include: { table: true, orderItems: true },
                });
                if (!updated)
                    throw new Error('Order not found after update');
                return updated;
            }));
            if (triggerDeduction) {
                deduction_queue_service_1.DeductionQueueService.enqueueDeduction(id, restaurantId);
            }
            return result;
        });
    }
    applyLoyaltyDiscount(id, restaurantId, pointsToRedeem) {
        return __awaiter(this, void 0, void 0, function* () {
            if (pointsToRedeem <= 0) {
                throw new Error('Points to redeem must be greater than zero');
            }
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const order = yield tx.order.findFirst({
                    where: { id, restaurantId },
                    include: { table: true, orderItems: true },
                });
                if (!order)
                    throw new Error('Order not found or unauthorized');
                if (order.status === 'PAID' || order.status === 'CANCELLED') {
                    throw new Error('Cannot apply loyalty discount to a paid or cancelled order');
                }
                if (!order.customerId) {
                    throw new Error('Order is not linked to a customer profile');
                }
                // 1. Verify points balance
                const account = yield tx.loyaltyAccount.findUnique({
                    where: { customerId: order.customerId }
                });
                if (!account || account.pointsBalance < pointsToRedeem) {
                    throw new Error(`Insufficient points. Balance: ${(account === null || account === void 0 ? void 0 : account.pointsBalance) || 0}, Required: ${pointsToRedeem}`);
                }
                // 2. Calculate discount (1 point = ₹1)
                const discount = Math.min(order.totalAmount, pointsToRedeem);
                const newTotalAmount = parseFloat((order.totalAmount - discount).toFixed(2));
                // Append note to order
                const orderNotes = `${order.notes || ''} [POS Redeemed ${pointsToRedeem} points, ₹${discount} discount]`.trim();
                // 3. Update order
                yield tx.order.update({
                    where: { id },
                    data: {
                        totalAmount: newTotalAmount,
                        notes: orderNotes,
                    },
                });
                // 4. Deduct points from loyalty account
                const loyaltyService = new loyalty_service_1.LoyaltyService();
                yield loyaltyService.redeemPoints(order.customerId, pointsToRedeem, order.id, tx);
                // Re-fetch order
                const updated = yield tx.order.findFirst({
                    where: { id, restaurantId },
                    include: { table: true, orderItems: true },
                });
                if (!updated)
                    throw new Error('Order not found after update');
                return updated;
            }));
        });
    }
    payOrder(id, restaurantId, paymentMethod) {
        return __awaiter(this, void 0, void 0, function* () {
            let triggerDeduction = false;
            const result = yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const order = yield tx.order.findFirst({
                    where: { id, restaurantId },
                    include: { table: true, orderItems: true },
                });
                if (!order)
                    throw new Error('Order not found or unauthorized');
                if (order.status === client_1.OrderStatus.PAID) {
                    return order;
                }
                // 1. Create Payment record
                const newPayment = yield tx.payment.create({
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
                yield tx.transaction.create({
                    data: {
                        restaurantId,
                        paymentId: newPayment.id,
                        amount: order.totalAmount,
                        transactionType: 'INCOME',
                        reference: `Waiter Settle: ${paymentMethod}`,
                    },
                });
                // 3. Update Order status to PAID
                yield tx.order.update({
                    where: { id },
                    data: { status: client_1.OrderStatus.PAID },
                });
                triggerDeduction = true;
                // 4. Earn loyalty points
                const restaurant = yield tx.restaurant.findUnique({
                    where: { id: restaurantId },
                    select: { brandId: true },
                });
                if (order.customerId && (restaurant === null || restaurant === void 0 ? void 0 : restaurant.brandId)) {
                    const loyaltyService = new loyalty_service_1.LoyaltyService();
                    yield loyaltyService.earnPoints(order.customerId, restaurant.brandId, order.totalAmount, order.id, tx);
                }
                // Re-fetch order with details
                const updated = yield tx.order.findFirst({
                    where: { id, restaurantId },
                    include: { table: true, orderItems: true },
                });
                if (!updated)
                    throw new Error('Order not found after update');
                return updated;
            }));
            if (triggerDeduction) {
                deduction_queue_service_1.DeductionQueueService.enqueueDeduction(id, restaurantId);
            }
            return result;
        });
    }
}
exports.OrderService = OrderService;
//# sourceMappingURL=order.service.js.map