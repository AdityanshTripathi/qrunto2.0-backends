import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const categoryController = new CategoryController();

// All category routes require authentication
router.use(authenticate);

router.get('/', (req, res) => categoryController.getCategories(req, res));
router.post('/', (req, res) => categoryController.createCategory(req, res));
router.patch('/:id', (req, res) => categoryController.updateCategory(req, res));
router.delete('/:id', (req, res) => categoryController.deleteCategory(req, res));

export default router;
