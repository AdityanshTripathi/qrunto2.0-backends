"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_controller_1 = require("../controllers/notification.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const notificationController = new notification_controller_1.NotificationController();
router.use(auth_middleware_1.authenticate);
router.get('/', (req, res) => notificationController.getNotifications(req, res));
router.patch('/read-all', (req, res) => notificationController.markAllAsRead(req, res));
router.patch('/:id/read', (req, res) => notificationController.markAsRead(req, res));
exports.default = router;
//# sourceMappingURL=notification.routes.js.map