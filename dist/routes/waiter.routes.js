"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const waiter_controller_1 = require("../controllers/waiter.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const waiterController = new waiter_controller_1.WaiterController();
// All routes here require auth and owner/superadmin role
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.requireRoles)([client_1.UserRole.SUPER_ADMIN, client_1.UserRole.RESTAURANT_OWNER]));
router.get('/', (req, res) => waiterController.list(req, res));
router.post('/', (req, res) => waiterController.create(req, res));
router.put('/:id', (req, res) => waiterController.update(req, res));
router.delete('/:id', (req, res) => waiterController.delete(req, res));
router.patch('/:id/status', (req, res) => waiterController.toggleStatus(req, res));
router.post('/:id/reset-password', (req, res) => waiterController.resetPassword(req, res));
exports.default = router;
//# sourceMappingURL=waiter.routes.js.map