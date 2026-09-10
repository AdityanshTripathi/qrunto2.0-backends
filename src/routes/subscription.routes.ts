import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscription.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const subscriptionController = new SubscriptionController();

// Protected route to select plan and initiate subscription
router.post('/', authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]), (req, res) => subscriptionController.createPendingSubscription(req, res));
router.post('/purchase', authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]), (req, res) => subscriptionController.purchaseSubscription(req, res));
router.get('/current', authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]), (req, res) => subscriptionController.getActiveSubscription(req, res));
router.post('/redeem', authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]), (req, res) => subscriptionController.redeemLicenseCode(req, res));

export default router;
