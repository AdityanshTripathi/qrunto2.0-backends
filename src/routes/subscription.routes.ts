import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const subscriptionController = new SubscriptionController();

// Protected route to select plan and initiate subscription
router.post('/', authenticate, (req, res) => subscriptionController.createPendingSubscription(req, res));
router.post('/purchase', authenticate, (req, res) => subscriptionController.purchaseSubscription(req, res));
router.get('/current', authenticate, (req, res) => subscriptionController.getActiveSubscription(req, res));
router.post('/redeem', authenticate, (req, res) => subscriptionController.redeemLicenseCode(req, res));

export default router;
