import { Router } from 'express';
import { CampaignController } from '../../controllers/crm/campaign.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const campaignController = new CampaignController();

router.use(authenticate);
router.use(requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]));

router.get('/', (req, res) => campaignController.getCampaigns(req, res));
router.post('/', (req, res) => campaignController.createCampaign(req, res));
router.get('/stats', (req, res) => campaignController.getCampaignStats(req, res));
router.delete('/:id', (req, res) => campaignController.deleteCampaign(req, res));
router.get('/:id/logs', (req, res) => campaignController.getCampaignLogs(req, res));

export default router;
