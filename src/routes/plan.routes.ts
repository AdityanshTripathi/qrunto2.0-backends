import { Router } from 'express';
import { PlanController } from '../controllers/plan.controller';

const router = Router();
const planController = new PlanController();

// Public route to list pricing plans
router.get('/', (req, res) => planController.getActivePlans(req, res));

export default router;
