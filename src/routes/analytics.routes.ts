import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { requireSecurityProof } from '../middlewares/security-proof.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const analyticsController = new AnalyticsController();

// All routes require owner authentication
router.use(authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]));

router.get('/overview', (req, res) => analyticsController.getOverview(req, res));
router.get('/executive', requireSecurityProof('analytics'), (req, res) => analyticsController.getExecutive(req, res));
router.get('/sales', requireSecurityProof('analytics'), (req, res) => analyticsController.getSales(req, res));
router.get('/orders', requireSecurityProof('analytics'), (req, res) => analyticsController.getOrders(req, res));
router.get('/menu', requireSecurityProof('analytics'), (req, res) => analyticsController.getMenu(req, res));
router.get('/customers', requireSecurityProof('analytics'), (req, res) => analyticsController.getCustomers(req, res));
router.get('/loyalty', requireSecurityProof('analytics'), (req, res) => analyticsController.getLoyalty(req, res));
router.get('/inventory', requireSecurityProof('analytics'), (req, res) => analyticsController.getInventory(req, res));
router.get('/financials', requireSecurityProof('analytics'), (req, res) => analyticsController.getFinancials(req, res));

export default router;
