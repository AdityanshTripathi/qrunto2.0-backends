import { Router } from 'express';
import { CustomerController } from '../../controllers/crm/customer.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const customerController = new CustomerController();

// All CRM routes require authentication and manager/owner/admin privileges
router.use(authenticate);
router.use(requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]));

router.get('/', (req, res) => customerController.getCustomers(req, res));
router.get('/occasions/upcoming', (req, res) => customerController.getUpcomingOccasions(req, res));
router.get('/:id', (req, res) => customerController.getCustomerById(req, res));
router.get('/:id/timeline', (req, res) => customerController.getCustomerTimeline(req, res));
router.post('/:id/notes', (req, res) => customerController.createCustomerNote(req, res));
router.put('/:id', (req, res) => customerController.updateCustomer(req, res));

export default router;
