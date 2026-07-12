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
exports.FeedbackController = void 0;
const prisma_1 = require("../../lib/prisma");
const feedback_service_1 = require("../../services/crm/feedback.service");
const zod_1 = require("zod");
const SubmitFeedbackSchema = zod_1.z.object({
    customerId: zod_1.z.string().uuid('Invalid customer ID'),
    orderId: zod_1.z.string().uuid('Invalid order ID'),
    rating: zod_1.z.number().int().min(1).max(5),
    comments: zod_1.z.string().max(500).optional().nullable(),
});
const UpdateTicketSchema = zod_1.z.object({
    status: zod_1.z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']),
    assignedUserId: zod_1.z.string().uuid().optional().nullable(),
});
const feedbackService = new feedback_service_1.FeedbackService();
class FeedbackController {
    // Public endpoint: Submit feedback on order
    submitFeedback(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const validation = SubmitFeedbackSchema.safeParse(req.body);
                if (!validation.success) {
                    res.status(400).json({ errors: validation.error.flatten().fieldErrors });
                    return;
                }
                const { customerId, orderId, rating, comments } = validation.data;
                const feedback = yield feedbackService.submitFeedback(customerId, orderId, rating, comments !== null && comments !== void 0 ? comments : null);
                res.status(201).json({ message: 'Feedback submitted successfully', feedback });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Get brand complaints ticket list (requires auth)
    getTickets(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                if (!user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: { restaurants: { select: { brandId: true } } }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const tickets = yield feedbackService.getTickets(brandId);
                res.status(200).json({ tickets });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Update ticket status or assignee (requires auth)
    updateTicket(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const ticketId = req.params['id'];
                if (!user || !ticketId) {
                    res.status(400).json({ error: 'Invalid parameters' });
                    return;
                }
                const validation = UpdateTicketSchema.safeParse(req.body);
                if (!validation.success) {
                    res.status(400).json({ errors: validation.error.flatten().fieldErrors });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: { restaurants: { select: { brandId: true } } }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const ticket = yield feedbackService.updateTicketStatus(brandId, ticketId, validation.data.status, validation.data.assignedUserId);
                res.status(200).json({ message: 'Ticket updated successfully', ticket });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Get brand feedback aggregate statistics (requires auth)
    getFeedbackStats(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                if (!user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const ownerRecord = yield prisma_1.prisma.user.findUnique({
                    where: { id: user.id },
                    include: { restaurants: { select: { brandId: true } } }
                });
                const brandId = (_b = (_a = ownerRecord === null || ownerRecord === void 0 ? void 0 : ownerRecord.restaurants) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.brandId;
                if (!brandId) {
                    res.status(400).json({ error: 'No brand context found' });
                    return;
                }
                const stats = yield feedbackService.getFeedbackStats(brandId);
                res.status(200).json({ stats });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.FeedbackController = FeedbackController;
//# sourceMappingURL=feedback.controller.js.map