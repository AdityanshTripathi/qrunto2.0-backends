import { Router } from 'express';
import { PublicController } from '../controllers/public.controller';

const router = Router();
const publicController = new PublicController();

// No authentication required for these routes — they are customer-facing
router.get('/:slug', (req, res) => publicController.getRestaurantMenu(req, res));
router.post('/:slug/orders', (req, res) => publicController.placeOrder(req, res));
router.get('/:slug/orders/:orderId/status', (req, res) => publicController.getOrderStatus(req, res));
router.post('/:slug/orders/:orderId/pay-mock', (req, res) => publicController.markOrderPaidMock(req, res));
router.post('/:slug/tables/:tableNumber/assistance', (req, res) => publicController.requestAssistance(req, res));

export default router;

