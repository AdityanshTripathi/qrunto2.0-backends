import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const orderController = new OrderController();

// All routes require owner authentication
router.use(authenticate);

router.get('/', (req, res) => orderController.getOrders(req, res));
router.get('/stats', (req, res) => orderController.getOrderStats(req, res));
router.get('/:id', (req, res) => orderController.getOrderById(req, res));
router.patch('/:id/status', (req, res) => orderController.updateOrderStatus(req, res));

export default router;
