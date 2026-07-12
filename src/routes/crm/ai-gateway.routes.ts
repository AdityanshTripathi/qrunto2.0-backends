import { Router } from 'express';
import { AIGatewayController } from '../../controllers/crm/ai-gateway.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const aiGatewayController = new AIGatewayController();

router.use(authenticate);
router.use(requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]));

router.get('/customers', (req, res) => aiGatewayController.searchCustomers(req, res));
router.post('/customers/:id/summary', (req, res) => aiGatewayController.updateCustomerSummary(req, res));
router.get('/segments', (req, res) => aiGatewayController.getSegmentsOverview(req, res));
router.get('/loyalty', (req, res) => aiGatewayController.getLoyaltyOverview(req, res));

export default router;
