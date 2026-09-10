import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const analyticsController = new AnalyticsController();

// All routes require owner authentication
router.use(authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]));

router.get('/overview', (req, res) => analyticsController.getOverview(req, res));
router.get('/executive', (req, res) => analyticsController.getExecutive(req, res));
router.get('/sales', (req, res) => analyticsController.getSales(req, res));
router.get('/orders', (req, res) => analyticsController.getOrders(req, res));
router.get('/menu', (req, res) => analyticsController.getMenu(req, res));
router.get('/customers', (req, res) => analyticsController.getCustomers(req, res));
router.get('/loyalty', (req, res) => analyticsController.getLoyalty(req, res));
router.get('/inventory', (req, res) => analyticsController.getInventory(req, res));
router.get('/financials', (req, res) => analyticsController.getFinancials(req, res));

export default router;
