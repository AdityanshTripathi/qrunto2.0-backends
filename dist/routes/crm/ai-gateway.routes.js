"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ai_gateway_controller_1 = require("../../controllers/crm/ai-gateway.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const aiGatewayController = new ai_gateway_controller_1.AIGatewayController();
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]));
router.get('/customers', (req, res) => aiGatewayController.searchCustomers(req, res));
router.post('/customers/:id/summary', (req, res) => aiGatewayController.updateCustomerSummary(req, res));
router.get('/segments', (req, res) => aiGatewayController.getSegmentsOverview(req, res));
router.get('/loyalty', (req, res) => aiGatewayController.getLoyaltyOverview(req, res));
exports.default = router;
//# sourceMappingURL=ai-gateway.routes.js.map