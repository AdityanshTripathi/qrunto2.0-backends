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
exports.NotificationController = void 0;
const prisma_1 = require("../lib/prisma");
class NotificationController {
    getNotifications(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
                const restaurantId = req.user.restaurantId;
                if (!isSuperAdmin && !restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const notifications = yield prisma_1.prisma.notification.findMany({
                    where: isSuperAdmin
                        ? { restaurantId: null }
                        : { restaurantId: restaurantId },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 50, // Limit to recent 50 notifications
                });
                res.status(200).json({ notifications });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    markAsRead(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const id = req.params['id'];
                if (!id) {
                    res.status(400).json({ error: 'Notification ID is required' });
                    return;
                }
                const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
                const restaurantId = req.user.restaurantId;
                // Find the notification
                const notification = yield prisma_1.prisma.notification.findUnique({
                    where: { id },
                });
                if (!notification) {
                    res.status(404).json({ error: 'Notification not found' });
                    return;
                }
                // Check permissions
                if (isSuperAdmin) {
                    if (notification.restaurantId !== null) {
                        res.status(403).json({ error: 'Access denied' });
                        return;
                    }
                }
                else {
                    if (notification.restaurantId !== restaurantId) {
                        res.status(403).json({ error: 'Access denied' });
                        return;
                    }
                }
                // Update isRead to true
                const updated = yield prisma_1.prisma.notification.update({
                    where: { id },
                    data: { isRead: true },
                });
                res.status(200).json({ notification: updated });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    markAllAsRead(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
                const restaurantId = req.user.restaurantId;
                if (!isSuperAdmin && !restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                // Update all unread notifications
                yield prisma_1.prisma.notification.updateMany({
                    where: isSuperAdmin
                        ? { restaurantId: null, isRead: false }
                        : { restaurantId: restaurantId, isRead: false },
                    data: { isRead: true },
                });
                res.status(200).json({ message: 'All notifications marked as read successfully' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.NotificationController = NotificationController;
//# sourceMappingURL=notification.controller.js.map