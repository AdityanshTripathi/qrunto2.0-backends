import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const orderController = new OrderController();

// All routes require owner authentication
router.use(authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN, 'WAITER']));

router.get('/', (req, res) => orderController.getOrders(req, res));
router.get('/stats', (req, res) => orderController.getOrderStats(req, res));
router.get('/:id', (req, res) => orderController.getOrderById(req, res));
router.patch('/:id/status', (req, res) => orderController.updateOrderStatus(req, res));
router.post('/:id/loyalty-discount', (req, res) => orderController.applyLoyaltyDiscount(req, res));
router.post('/:id/pay', (req, res) => orderController.payOrder(req, res));

export default router;
