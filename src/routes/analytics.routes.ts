import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const analyticsController = new AnalyticsController();

// All routes require owner authentication
router.use(authenticate);

router.get('/overview', (req, res) => analyticsController.getOverview(req, res));

export default router;
