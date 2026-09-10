import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const categoryController = new CategoryController();

// All category routes require authentication
router.use(authenticate);

const categoryReadRoles = requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN, 'WAITER']);
const categoryWriteRoles = requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]);

router.get('/', categoryReadRoles, (req, res) => categoryController.getCategories(req, res));
router.post('/', categoryWriteRoles, (req, res) => categoryController.createCategory(req, res));
router.patch('/:id', categoryWriteRoles, (req, res) => categoryController.updateCategory(req, res));
router.delete('/:id', categoryWriteRoles, (req, res) => categoryController.deleteCategory(req, res));

export default router;
