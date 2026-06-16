"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const order_controller_1 = require("../controllers/order.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const orderController = new order_controller_1.OrderController();
// All routes require owner authentication
router.use(auth_middleware_1.authenticate);
router.get('/', (req, res) => orderController.getOrders(req, res));
router.get('/stats', (req, res) => orderController.getOrderStats(req, res));
router.get('/:id', (req, res) => orderController.getOrderById(req, res));
router.patch('/:id/status', (req, res) => orderController.updateOrderStatus(req, res));
exports.default = router;
//# sourceMappingURL=order.routes.js.map