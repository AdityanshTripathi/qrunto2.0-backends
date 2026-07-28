import { Router } from 'express';
import { SuperAdminController } from '../controllers/superadmin.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const superAdminController = new SuperAdminController();

// All routes here require Authentication and SUPER_ADMIN role
router.use(authenticate, requireRoles([UserRole.SUPER_ADMIN]));

// Platform overview statistics
router.get('/dashboard-stats', (req, res) => superAdminController.getDashboardStats(req, res));

// Restaurant management
router.get('/restaurants', (req, res) => superAdminController.getRestaurants(req, res));
router.patch('/restaurants/:id/toggle-status', (req, res) => superAdminController.toggleRestaurantStatus(req, res));
router.post('/restaurants/:id/login-as', (req, res) => superAdminController.generateLoginAsToken(req, res));
router.patch('/restaurants/:id/subscription', (req, res) => superAdminController.updateRestaurantSubscription(req, res));
router.delete('/restaurants/:id', (req, res) => superAdminController.deleteRestaurant(req, res));


// Subscription plans CRUD
router.post('/plans', (req, res) => superAdminController.createPlan(req, res));
router.patch('/plans/:id', (req, res) => superAdminController.updatePlan(req, res));
router.delete('/plans/:id', (req, res) => superAdminController.deletePlan(req, res));

// License Activation Codes
router.post('/license-codes', (req, res) => superAdminController.generateLicenseCode(req, res));
router.get('/license-codes', (req, res) => superAdminController.listLicenseCodes(req, res));
router.delete('/license-codes/:id', (req, res) => superAdminController.deleteLicenseCode(req, res));

// Transactions Logs
router.get('/transactions', (req, res) => superAdminController.getTransactions(req, res));

// Passcode Reset Requests
router.get('/passcode-resets', (req, res) => superAdminController.getPasscodeResets(req, res));
router.patch('/passcode-resets/:id/action', (req, res) => superAdminController.handlePasscodeReset(req, res));

// WhatsApp Manager routes
router.post('/whatsapp/send-message', async (req, res) => {
  try {
    const { WhatsAppService } = await import('../services/whatsapp.service');
    const { phone, message } = req.body;
    if (!phone || !message) {
      res.status(400).json({ message: 'Phone number and message text are required.' });
      return;
    }
    const result = await WhatsAppService.sendTextMessage(phone, message);
    res.status(200).json({ success: true, message: 'WhatsApp message delivered!', result });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'WhatsApp message failed to send.' });
  }
});

export default router;

