import { Router } from 'express';
import { SegmentController } from '../../controllers/crm/segment.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const segmentController = new SegmentController();

router.use(authenticate);
router.use(requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]));

router.get('/', (req, res) => segmentController.getSegments(req, res));
router.post('/', (req, res) => segmentController.createSegment(req, res));
router.get('/rfm', (req, res) => segmentController.getRFMScores(req, res));
router.delete('/:id', (req, res) => segmentController.deleteSegment(req, res));
router.get('/:id/members', (req, res) => segmentController.getSegmentMembers(req, res));
router.post('/:id/retrace', (req, res) => segmentController.retraceSegment(req, res));

export default router;
