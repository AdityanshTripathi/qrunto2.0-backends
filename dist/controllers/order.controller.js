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
exports.OrderController = void 0;
const zod_1 = require("zod");
const order_service_1 = require("../services/order.service");
const client_1 = require("@prisma/client");
const orderService = new order_service_1.OrderService();
const UpdateStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'], {
        error: 'Invalid status value',
    }),
});
class OrderController {
    getOrders(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
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
                // Parse query filters
                const statusParam = req.query['status'];
                const dateParam = req.query['date'];
                const filters = {};
                if (statusParam && Object.values(client_1.OrderStatus).includes(statusParam)) {
                    filters.status = statusParam;
                }
                if (dateParam) {
                    const parsedDate = new Date(dateParam);
                    if (!isNaN(parsedDate.getTime()))
                        filters.date = parsedDate;
                }
                const orders = yield orderService.getOrders(restaurantId, filters);
                res.status(200).json({ orders });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    getOrderStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const stats = yield orderService.getOrderStats(restaurantId);
                res.status(200).json({ stats });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    getOrderById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const id = req.params['id'];
                const order = yield orderService.getOrderById(id, restaurantId);
                if (!order) {
                    res.status(404).json({ error: 'Order not found' });
                    return;
                }
                res.status(200).json({ order });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    updateOrderStatus(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const id = req.params['id'];
                const validationResult = UpdateStatusSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const order = yield orderService.updateOrderStatus(id, restaurantId, validationResult.data.status);
                const io = req.app.get('io');
                if (io) {
                    io.to(restaurantId).emit('ORDER_UPDATED', {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        status: order.status,
                        tableNumber: order.table.tableNumber,
                        totalAmount: order.totalAmount,
                    });
                    if (order.status === 'READY') {
                        io.to(restaurantId).emit('ORDER_READY', {
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            tableNumber: order.table.tableNumber,
                        });
                    }
                }
                res.status(200).json({ order });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    applyLoyaltyDiscount(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const id = req.params['id'];
                const { pointsToRedeem } = req.body;
                if (typeof pointsToRedeem !== 'number' || pointsToRedeem <= 0) {
                    res.status(400).json({ error: 'Invalid pointsToRedeem value' });
                    return;
                }
                const order = yield orderService.applyLoyaltyDiscount(id, restaurantId, pointsToRedeem);
                res.status(200).json({ order });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    payOrder(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
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
                const id = req.params['id'];
                const { paymentMethod } = req.body;
                const order = yield orderService.payOrder(id, restaurantId, paymentMethod);
                const io = req.app.get('io');
                if (io) {
                    io.to(restaurantId).emit('ORDER_UPDATED', {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        status: order.status,
                        tableNumber: order.table.tableNumber,
                        totalAmount: order.totalAmount,
                    });
                }
                res.status(200).json({ order });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.OrderController = OrderController;
//# sourceMappingURL=order.controller.js.map