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
exports.OrderRepository = void 0;
const prisma_1 = require("../lib/prisma");
class OrderRepository {
    findMany(restaurantId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            const where = { restaurantId };
            if (filters === null || filters === void 0 ? void 0 : filters.status) {
                where.status = filters.status;
            }
            if (filters === null || filters === void 0 ? void 0 : filters.date) {
                const start = new Date(filters.date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(filters.date);
                end.setHours(23, 59, 59, 999);
                where.createdAt = { gte: start, lte: end };
            }
            return prisma_1.prisma.order.findMany({
                where,
                include: { table: true, orderItems: true },
                orderBy: { createdAt: 'desc' },
            });
        });
    }
    findById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.order.findFirst({
                where: { id, restaurantId },
                include: { table: true, orderItems: true },
            });
        });
    }
    countByStatus(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const counts = yield prisma_1.prisma.order.groupBy({
                by: ['status'],
                where: { restaurantId },
                _count: { status: true },
            });
            const result = {
                NEW: 0, PREPARING: 0, READY: 0, SERVED: 0, CANCELLED: 0,
            };
            counts.forEach(({ status, _count }) => {
                result[status] = _count.status;
            });
            return result;
        });
    }
    updateStatus(id, restaurantId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            yield prisma_1.prisma.order.updateMany({
                where: { id, restaurantId },
                data: { status },
            });
            const updated = yield this.findById(id, restaurantId);
            if (!updated)
                throw new Error('Order not found');
            return updated;
        });
    }
}
exports.OrderRepository = OrderRepository;
//# sourceMappingURL=order.repository.js.map