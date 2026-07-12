"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const customer_controller_1 = require("../../controllers/crm/customer.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const customerController = new customer_controller_1.CustomerController();
// All CRM routes require authentication and manager/owner/admin privileges
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]));
router.get('/', (req, res) => customerController.getCustomers(req, res));
router.get('/occasions/upcoming', (req, res) => customerController.getUpcomingOccasions(req, res));
router.get('/:id', (req, res) => customerController.getCustomerById(req, res));
router.get('/:id/timeline', (req, res) => customerController.getCustomerTimeline(req, res));
router.post('/:id/notes', (req, res) => customerController.createCustomerNote(req, res));
router.put('/:id', (req, res) => customerController.updateCustomer(req, res));
exports.default = router;
//# sourceMappingURL=customer.routes.js.map