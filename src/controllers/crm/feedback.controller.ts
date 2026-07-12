import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { prisma } from '../../lib/prisma';
import { FeedbackService } from '../../services/crm/feedback.service';
import { z } from 'zod';
import { TicketStatus } from '@prisma/client';

const SubmitFeedbackSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  orderId: z.string().uuid('Invalid order ID'),
  rating: z.number().int().min(1).max(5),
  comments: z.string().max(500).optional().nullable(),
});

const UpdateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const),
  assignedUserId: z.string().uuid().optional().nullable(),
});

const feedbackService = new FeedbackService();

export class FeedbackController {
  // Public endpoint: Submit feedback on order
  async submitFeedback(req: Request, res: Response): Promise<void> {
    try {
      const validation = SubmitFeedbackSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ errors: validation.error.flatten().fieldErrors });
        return;
      }

      const { customerId, orderId, rating, comments } = validation.data;
      const feedback = await feedbackService.submitFeedback(customerId, orderId, rating, comments ?? null);

      res.status(201).json({ message: 'Feedback submitted successfully', feedback });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Get brand complaints ticket list (requires auth)
  async getTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const tickets = await feedbackService.getTickets(brandId);
      res.status(200).json({ tickets });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Update ticket status or assignee (requires auth)
  async updateTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const ticketId = req.params['id'] as string;

      if (!user || !ticketId) {
        res.status(400).json({ error: 'Invalid parameters' });
        return;
      }

      const validation = UpdateTicketSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ errors: validation.error.flatten().fieldErrors });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const ticket = await feedbackService.updateTicketStatus(
        brandId,
        ticketId,
        validation.data.status as TicketStatus,
        validation.data.assignedUserId
      );

      res.status(200).json({ message: 'Ticket updated successfully', ticket });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Get brand feedback aggregate statistics (requires auth)
  async getFeedbackStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const stats = await feedbackService.getFeedbackStats(brandId);
      res.status(200).json({ stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
