"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subscription_controller_1 = require("../controllers/subscription.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const subscriptionController = new subscription_controller_1.SubscriptionController();
// Protected route to select plan and initiate subscription
router.post('/', auth_middleware_1.authenticate, (req, res) => subscriptionController.createPendingSubscription(req, res));
router.post('/purchase', auth_middleware_1.authenticate, (req, res) => subscriptionController.purchaseSubscription(req, res));
router.get('/current', auth_middleware_1.authenticate, (req, res) => subscriptionController.getActiveSubscription(req, res));
router.post('/redeem', auth_middleware_1.authenticate, (req, res) => subscriptionController.redeemLicenseCode(req, res));
exports.default = router;
//# sourceMappingURL=subscription.routes.js.map