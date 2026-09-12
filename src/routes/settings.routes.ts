import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { authenticate, requireRestaurantContext, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const settingsController = new SettingsController();

// Require authentication for settings endpoints
router.use(authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]), requireRestaurantContext);

router.get('/', (req, res) => settingsController.getSettings(req, res));
router.patch('/', (req, res) => settingsController.updateSettings(req, res));

export default router;

