import { Router } from 'express';
import { LoyaltyController } from '../../controllers/crm/loyalty.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const loyaltyController = new LoyaltyController();

// All loyalty configurations require owner or superadmin privileges
router.use(authenticate);
router.use(requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]));

router.get('/tiers', (req, res) => loyaltyController.getTiers(req, res));
router.post('/tiers', (req, res) => loyaltyController.upsertTier(req, res));
router.put('/tiers/:id', (req, res) => loyaltyController.upsertTier(req, res));
router.delete('/tiers/:id', (req, res) => loyaltyController.deleteTier(req, res));
router.get('/balance', (req, res) => loyaltyController.getBalanceByPhone(req, res));

export default router;
