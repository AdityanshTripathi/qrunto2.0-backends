"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class FeedbackService {
    // Submit guest feedback on an order
    submitFeedback(customerId, orderId, rating, comments) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verify order exists
            const order = yield prisma_1.prisma.order.findUnique({
                where: { id: orderId },
            });
            if (!order) {
                throw new Error('Order not found');
            }
            // Create feedback
            const feedback = yield prisma_1.prisma.feedback.create({
                data: {
                    orderId,
                    customerId,
                    rating,
                    comments,
                },
            });
            // Auto-create ticket if rating is poor (1 or 2 stars)
            if (rating <= 2) {
                yield prisma_1.prisma.complaintTicket.create({
                    data: {
                        brandId: order.restaurantId, // Using restaurantId as brand context fallback
                        feedbackId: feedback.id,
                        customerId,
                        subject: `Critical Review Alert (Order #${order.orderNumber})`,
                        description: `Guest rated this dining order ${rating}/5 stars. Comments: "${comments || 'No comments left.'}"`,
                        status: client_1.TicketStatus.OPEN,
                    },
                });
                // Create notification for staff
                yield prisma_1.prisma.notification.create({
                    data: {
                        restaurantId: order.restaurantId,
                        title: `⚠️ Poor Rating Alert`,
                        message: `Order #${order.orderNumber} received a ${rating}-star rating. A complaint ticket has been filed.`,
                        type: 'SYSTEM',
                    },
                });
            }
            return feedback;
        });
    }
    // Get brand complaints list
    getTickets(brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.complaintTicket.findMany({
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
        });
    }
    // Update ticket status or assignee
    updateTicketStatus(brandId, ticketId, status, assignedUserId) {
        return __awaiter(this, void 0, void 0, function* () {
            const ticket = yield prisma_1.prisma.complaintTicket.findFirst({
                where: {
                    id: ticketId,
                },
            });
            if (!ticket) {
                throw new Error('Complaint ticket not found');
            }
            const updateData = { status };
            if (assignedUserId !== undefined) {
                updateData.assignedUserId = assignedUserId;
            }
            return prisma_1.prisma.complaintTicket.update({
                where: { id: ticketId },
                data: updateData,
            });
        });
    }
    // Fetch reviews metrics
    getFeedbackStats(brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            const feedbacks = yield prisma_1.prisma.feedback.findMany({
                where: {
                    customer: { brandId },
                },
            });
            const total = feedbacks.length;
            const avg = total > 0 ? feedbacks.reduce((acc, curr) => acc + curr.rating, 0) / total : 0;
            // Count distribution
            const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
            for (const f of feedbacks) {
                const r = f.rating;
                if (distribution[r] !== undefined)
                    distribution[r]++;
            }
            return {
                totalReviews: total,
                averageRating: parseFloat(avg.toFixed(2)),
                distribution,
            };
        });
    }
}
exports.FeedbackService = FeedbackService;
//# sourceMappingURL=feedback.service.js.map