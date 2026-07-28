import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const analyticsController = new AnalyticsController();

// All routes require owner authentication
router.use(authenticate);

router.get('/overview', (req, res) => analyticsController.getOverview(req, res));
router.get('/executive', (req, res) => analyticsController.getExecutive(req, res));
router.get('/sales', (req, res) => analyticsController.getSales(req, res));
router.get('/orders', (req, res) => analyticsController.getOrders(req, res));
router.get('/menu', (req, res) => analyticsController.getMenu(req, res));
router.get('/customers', (req, res) => analyticsController.getCustomers(req, res));
router.get('/loyalty', (req, res) => analyticsController.getLoyalty(req, res));

export default router;
