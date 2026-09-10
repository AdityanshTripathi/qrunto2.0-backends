import { Router } from 'express';
import { MenuItemController } from '../controllers/menuItem.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const menuItemController = new MenuItemController();

// All menu item routes require authentication
router.use(authenticate);

const menuReadRoles = requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN, 'WAITER']);
const menuWriteRoles = requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]);

router.get('/', menuReadRoles, (req, res) => menuItemController.getMenuItems(req, res));
router.get('/:id', menuReadRoles, (req, res) => menuItemController.getMenuItemById(req, res));
router.post('/', menuWriteRoles, (req, res) => menuItemController.createMenuItem(req, res));
router.patch('/:id', menuWriteRoles, (req, res) => menuItemController.updateMenuItem(req, res));
router.delete('/:id', menuWriteRoles, (req, res) => menuItemController.deleteMenuItem(req, res));

export default router;
