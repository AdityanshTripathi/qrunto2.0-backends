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
exports.TimelineService = void 0;
const prisma_1 = require("../../lib/prisma");
class TimelineService {
    getCustomerTimeline(customerId, brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // 1. Verify customer belongs to the brand
            const customer = yield prisma_1.prisma.customer.findFirst({
                where: { id: customerId, brandId },
            });
            if (!customer) {
                throw new Error('Customer not found or unauthorized');
            }
            const events = [];
            // 2. Fetch Orders
            const orders = yield prisma_1.prisma.order.findMany({
                where: { customerId },
                include: {
                    orderItems: true,
                    table: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            for (const order of orders) {
                events.push({
                    id: `order-${order.id}`,
                    type: 'ORDER',
                    title: `Order #${order.orderNumber}`,
                    description: `Total: ₹${order.totalAmount.toLocaleString('en-IN')} (${order.status})`,
                    timestamp: order.createdAt,
                    metadata: {
                        orderId: order.id,
                        status: order.status,
                        total: order.totalAmount,
                        items: order.orderItems.map((item) => ({
                            name: item.itemName,
                            quantity: item.quantity,
                            price: item.unitPrice,
                        })),
                        tableNumber: (_a = order.table) === null || _a === void 0 ? void 0 : _a.tableNumber,
                        notes: order.notes,
                    },
                });
            }
            // 3. Fetch Notes
            const notes = yield prisma_1.prisma.customerNote.findMany({
                where: { customerId },
                include: {
                    user: {
                        select: { name: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            for (const note of notes) {
                events.push({
                    id: `note-${note.id}`,
                    type: 'NOTE',
                    title: note.isSystem ? 'System Note' : `Note by ${note.user.name}`,
                    description: note.noteText,
                    timestamp: note.createdAt,
                    metadata: {
                        noteId: note.id,
                        isSystem: note.isSystem,
                        userName: note.user.name,
                    },
                });
            }
            // 4. Fetch Loyalty Ledger Logs
            const loyaltyAccount = yield prisma_1.prisma.loyaltyAccount.findUnique({
                where: { customerId },
            });
            if (loyaltyAccount) {
                const ledgers = yield prisma_1.prisma.loyaltyLedger.findMany({
                    where: { loyaltyAccountId: loyaltyAccount.id },
                    orderBy: { createdAt: 'desc' },
                });
                for (const ledger of ledgers) {
                    events.push({
                        id: `loyalty-${ledger.id}`,
                        type: 'LOYALTY',
                        title: `Loyalty Points (${ledger.transactionType})`,
                        description: `${ledger.points > 0 ? '+' : ''}${ledger.points} Points: ${ledger.description}`,
                        timestamp: ledger.createdAt,
                        metadata: {
                            ledgerId: ledger.id,
                            points: ledger.points,
                            type: ledger.transactionType,
                            orderId: ledger.orderId,
                        },
                    });
                }
            }
            // 5. Add Registration Event
            events.push({
                id: `reg-${customer.id}`,
                type: 'REGISTRATION',
                title: 'Customer Registered',
                description: `Acquired via ${customer.acquisitionSource.replace('_', ' ')}`,
                timestamp: customer.createdAt,
                metadata: {
                    acquisitionSource: customer.acquisitionSource,
                },
            });
            // 6. Sort all events chronologically descending (newest first)
            return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        });
    }
}
exports.TimelineService = TimelineService;
//# sourceMappingURL=timeline.service.js.map