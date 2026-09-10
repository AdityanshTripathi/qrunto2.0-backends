import { Router } from 'express';
import { TableController } from '../controllers/table.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const tableController = new TableController();

router.use(authenticate);

const tableReadRoles = requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN, 'WAITER']);
const tableWriteRoles = requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]);

router.get('/', tableReadRoles, (req, res) => tableController.getTables(req, res));
router.post('/', tableWriteRoles, (req, res) => tableController.createTable(req, res));
router.patch('/:id', tableWriteRoles, (req, res) => tableController.updateTable(req, res));
router.delete('/:id', tableWriteRoles, (req, res) => tableController.deleteTable(req, res));

export default router;
