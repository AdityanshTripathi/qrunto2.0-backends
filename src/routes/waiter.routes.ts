import { Router } from 'express';
import { WaiterController } from '../controllers/waiter.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const waiterController = new WaiterController();

// All routes here require auth and owner/superadmin role
router.use(authenticate);
router.use(requireRoles([UserRole.SUPER_ADMIN, UserRole.RESTAURANT_OWNER]));

router.get('/', (req, res) => waiterController.list(req, res));
router.post('/', (req, res) => waiterController.create(req, res));
router.put('/:id', (req, res) => waiterController.update(req, res));
router.delete('/:id', (req, res) => waiterController.delete(req, res));
router.patch('/:id/status', (req, res) => waiterController.toggleStatus(req, res));
router.post('/:id/reset-password', (req, res) => waiterController.resetPassword(req, res));

export default router;
