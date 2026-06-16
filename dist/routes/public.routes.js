"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const public_controller_1 = require("../controllers/public.controller");
const router = (0, express_1.Router)();
const publicController = new public_controller_1.PublicController();
// No authentication required for these routes — they are customer-facing
router.get('/:slug', (req, res) => publicController.getRestaurantMenu(req, res));
router.post('/:slug/orders', (req, res) => publicController.placeOrder(req, res));
router.get('/:slug/orders/:orderId/status', (req, res) => publicController.getOrderStatus(req, res));
router.post('/:slug/orders/:orderId/pay-mock', (req, res) => publicController.markOrderPaidMock(req, res));
router.post('/:slug/tables/:tableNumber/assistance', (req, res) => publicController.requestAssistance(req, res));
exports.default = router;
//# sourceMappingURL=public.routes.js.map