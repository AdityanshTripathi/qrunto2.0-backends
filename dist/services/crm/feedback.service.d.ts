import { TicketStatus } from '@prisma/client';
export declare class FeedbackService {
    submitFeedback(customerId: string, orderId: string, rating: number, comments: string | null): Promise<any>;
    getTickets(brandId: string): Promise<any[]>;
    updateTicketStatus(brandId: string, ticketId: string, status: TicketStatus, assignedUserId?: string | null): Promise<any>;
    getFeedbackStats(brandId: string): Promise<any>;
}
//# sourceMappingURL=feedback.service.d.ts.map