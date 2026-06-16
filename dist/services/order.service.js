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
const orderRepository = new order_repository_1.OrderRepository();
// Valid status transitions
const ALLOWED_TRANSITIONS = {
    NEW: [client_1.OrderStatus.PREPARING, client_1.OrderStatus.CANCELLED],
    PREPARING: [client_1.OrderStatus.READY, client_1.OrderStatus.CANCELLED],
    READY: [client_1.OrderStatus.SERVED, client_1.OrderStatus.CANCELLED],
    SERVED: [],
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
            const order = yield orderRepository.findById(id, restaurantId);
            if (!order)
                throw new Error('Order not found or unauthorized');
            // Validate transition
            const allowed = ALLOWED_TRANSITIONS[order.status];
            if (!allowed.includes(newStatus)) {
                throw new Error(`Invalid status transition: cannot move from "${order.status}" to "${newStatus}"`);
            }
            return orderRepository.updateStatus(id, restaurantId, newStatus);
        });
    }
}
exports.OrderService = OrderService;
//# sourceMappingURL=order.service.js.map