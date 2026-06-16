import { Router } from 'express';
import { TableController } from '../controllers/table.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const tableController = new TableController();

router.use(authenticate);

router.get('/', (req, res) => tableController.getTables(req, res));
router.post('/', (req, res) => tableController.createTable(req, res));
router.patch('/:id', (req, res) => tableController.updateTable(req, res));
router.delete('/:id', (req, res) => tableController.deleteTable(req, res));

export default router;
