"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const feedback_controller_1 = require("../../controllers/crm/feedback.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const feedbackController = new feedback_controller_1.FeedbackController();
// Public feedback submission (no auth)
router.post('/submit', (req, res) => feedbackController.submitFeedback(req, res));
// Authenticated merchant endpoints
router.get('/tickets', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]), (req, res) => feedbackController.getTickets(req, res));
router.put('/tickets/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]), (req, res) => feedbackController.updateTicket(req, res));
router.get('/stats', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]), (req, res) => feedbackController.getFeedbackStats(req, res));
exports.default = router;
//# sourceMappingURL=feedback.routes.js.map