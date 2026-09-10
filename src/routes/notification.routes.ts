import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const notificationController = new NotificationController();

router.use(authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN, 'WAITER']));

router.get('/', (req, res) => notificationController.getNotifications(req, res));
router.patch('/read-all', (req, res) => notificationController.markAllAsRead(req, res));
router.patch('/:id/read', (req, res) => notificationController.markAsRead(req, res));

export default router;
