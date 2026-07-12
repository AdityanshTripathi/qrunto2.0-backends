"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const loyalty_controller_1 = require("../../controllers/crm/loyalty.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const loyaltyController = new loyalty_controller_1.LoyaltyController();
// All loyalty configurations require owner or superadmin privileges
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]));
router.get('/tiers', (req, res) => loyaltyController.getTiers(req, res));
router.post('/tiers', (req, res) => loyaltyController.upsertTier(req, res));
router.put('/tiers/:id', (req, res) => loyaltyController.upsertTier(req, res));
router.delete('/tiers/:id', (req, res) => loyaltyController.deleteTier(req, res));
router.get('/balance', (req, res) => loyaltyController.getBalanceByPhone(req, res));
exports.default = router;
//# sourceMappingURL=loyalty.routes.js.map