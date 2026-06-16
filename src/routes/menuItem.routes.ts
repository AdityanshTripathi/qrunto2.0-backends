import { Router } from 'express';
import { MenuItemController } from '../controllers/menuItem.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const menuItemController = new MenuItemController();

// All menu item routes require authentication
router.use(authenticate);

router.get('/', (req, res) => menuItemController.getMenuItems(req, res));
router.get('/:id', (req, res) => menuItemController.getMenuItemById(req, res));
router.post('/', (req, res) => menuItemController.createMenuItem(req, res));
router.patch('/:id', (req, res) => menuItemController.updateMenuItem(req, res));
router.delete('/:id', (req, res) => menuItemController.deleteMenuItem(req, res));

export default router;
