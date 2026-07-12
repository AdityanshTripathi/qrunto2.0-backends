import { Router } from 'express';
import { FeedbackController } from '../../controllers/crm/feedback.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const feedbackController = new FeedbackController();

// Public feedback submission (no auth)
router.post('/submit', (req, res) => feedbackController.submitFeedback(req, res));

// Authenticated merchant endpoints
router.get('/tickets', authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]), (req, res) =>
  feedbackController.getTickets(req, res)
);
router.put('/tickets/:id', authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]), (req, res) =>
  feedbackController.updateTicket(req, res)
);
router.get('/stats', authenticate, requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]), (req, res) =>
  feedbackController.getFeedbackStats(req, res)
);

export default router;
