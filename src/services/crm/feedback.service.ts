import { prisma } from '../../lib/prisma';
import { TicketStatus } from '@prisma/client';

export class FeedbackService {
  // Submit guest feedback on an order
  async submitFeedback(
    customerId: string,
    orderId: string,
    rating: number,
    comments: string | null
  ): Promise<any> {
    // Verify order exists
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Create feedback
    const feedback = await prisma.feedback.create({
      data: {
        orderId,
        customerId,
        rating,
        comments,
      },
    });

    // Auto-create ticket if rating is poor (1 or 2 stars)
    if (rating <= 2) {
      await prisma.complaintTicket.create({
        data: {
          brandId: order.restaurantId, // Using restaurantId as brand context fallback
          feedbackId: feedback.id,
          customerId,
          subject: `Critical Review Alert (Order #${order.orderNumber})`,
          description: `Guest rated this dining order ${rating}/5 stars. Comments: "${comments || 'No comments left.'}"`,
          status: TicketStatus.OPEN,
        },
      });

      // Create notification for staff
      await prisma.notification.create({
        data: {
          restaurantId: order.restaurantId,
          title: `⚠️ Poor Rating Alert`,
          message: `Order #${order.orderNumber} received a ${rating}-star rating. A complaint ticket has been filed.`,
          type: 'SYSTEM',
        },
      });
    }

    return feedback;
  }

  // Get brand complaints list
  async getTickets(brandId: string): Promise<any[]> {
    return prisma.complaintTicket.findMany({
      where: {
        OR: [
          { brandId },
          { brand: { restaurants: { some: { id: brandId } } } },
        ],
      },
      include: {
        customer: { select: { name: true, phone: true } },
        feedback: { select: { rating: true, comments: true } },
        assignedUser: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Update ticket status or assignee
  async updateTicketStatus(
    brandId: string,
    ticketId: string,
    status: TicketStatus,
    assignedUserId?: string | null
  ): Promise<any> {
    const ticket = await prisma.complaintTicket.findFirst({
      where: {
        id: ticketId,
      },
    });

    if (!ticket) {
      throw new Error('Complaint ticket not found');
    }

    const updateData: { status: TicketStatus; assignedUserId?: string | null } = { status };
    if (assignedUserId !== undefined) {
      updateData.assignedUserId = assignedUserId;
    }

    return prisma.complaintTicket.update({
      where: { id: ticketId },
      data: updateData,
    });
  }

  // Fetch reviews metrics
  async getFeedbackStats(brandId: string): Promise<any> {
    const feedbacks = await prisma.feedback.findMany({
      where: {
        customer: { brandId },
      },
    });

    const total = feedbacks.length;
    const avg = total > 0 ? feedbacks.reduce((acc, curr) => acc + curr.rating, 0) / total : 0;
    
    // Count distribution
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const f of feedbacks) {
      const r = f.rating as keyof typeof distribution;
      if (distribution[r] !== undefined) distribution[r]++;
    }

    return {
      totalReviews: total,
      averageRating: parseFloat(avg.toFixed(2)),
      distribution,
    };
  }
}
