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
exports.CustomerRepository = void 0;
const prisma_1 = require("../../lib/prisma");
class CustomerRepository {
    findById(id, brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.customer.findFirst({
                where: { id, brandId },
                include: {
                    profiles: true,
                    notes: {
                        orderBy: { createdAt: 'desc' },
                        include: {
                            user: {
                                select: { name: true }
                            }
                        }
                    }
                }
            });
        });
    }
    findByPhone(phone, brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.customer.findFirst({
                where: { phone, brandId },
                include: {
                    profiles: true,
                }
            });
        });
    }
    create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.customer.create({
                data: {
                    brandId: data.brandId,
                    name: data.name,
                    phone: data.phone,
                    email: data.email || null,
                    acquisitionSource: data.acquisitionSource || 'QR_ORDER',
                    metadataJson: data.metadataJson || {},
                },
            });
        });
    }
    update(id, brandId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // Multi-tenant check
            const existing = yield prisma_1.prisma.customer.findFirst({
                where: { id, brandId },
            });
            if (!existing) {
                throw new Error('Customer not found or unauthorized');
            }
            return prisma_1.prisma.customer.update({
                where: { id },
                data: data,
            });
        });
    }
    findMany(brandId_1) {
        return __awaiter(this, arguments, void 0, function* (brandId, filters = {}) {
            var _a, _b, _c, _d, _e;
            const limit = (_a = filters.limit) !== null && _a !== void 0 ? _a : 20;
            const offset = (_b = filters.offset) !== null && _b !== void 0 ? _b : 0;
            const search = (_c = filters.search) === null || _c === void 0 ? void 0 : _c.trim();
            const sortBy = (_d = filters.sortBy) !== null && _d !== void 0 ? _d : 'createdAt';
            const sortOrder = (_e = filters.sortOrder) !== null && _e !== void 0 ? _e : 'desc';
            const restaurantId = filters.restaurantId;
            // Build dynamic where clause
            const whereClause = {
                brandId,
            };
            if (search) {
                whereClause.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                ];
            }
            if (restaurantId) {
                whereClause.profiles = {
                    some: {
                        restaurantId,
                    },
                };
            }
            // Determine query order
            let orderByClause = {};
            if (sortBy === 'name' || sortBy === 'createdAt' || sortBy === 'updatedAt') {
                orderByClause[sortBy] = sortOrder;
            }
            // Build include clause dynamically to prevent exactOptionalPropertyTypes errors
            const includeClause = {
                profiles: true,
            };
            if (restaurantId) {
                includeClause.profiles = {
                    where: { restaurantId },
                };
            }
            const customers = yield prisma_1.prisma.customer.findMany({
                where: whereClause,
                include: includeClause,
                orderBy: Object.keys(orderByClause).length > 0 ? orderByClause : { createdAt: 'desc' },
                take: limit,
                skip: offset,
            });
            // Custom sorting for profile metrics (totalSpend, totalOrders, aov, lastVisit)
            if (restaurantId && ['totalSpend', 'totalOrders', 'aov', 'lastVisit'].includes(sortBy)) {
                customers.sort((a, b) => {
                    var _a, _b;
                    const profA = (_a = a.profiles) === null || _a === void 0 ? void 0 : _a[0];
                    const profB = (_b = b.profiles) === null || _b === void 0 ? void 0 : _b[0];
                    let valA = 0;
                    let valB = 0;
                    if (profA)
                        valA = profA[sortBy];
                    if (profB)
                        valB = profB[sortBy];
                    if (sortBy === 'lastVisit') {
                        valA = valA ? new Date(valA).getTime() : 0;
                        valB = valB ? new Date(valB).getTime() : 0;
                    }
                    return sortOrder === 'desc'
                        ? (valB > valA ? 1 : -1)
                        : (valA > valB ? 1 : -1);
                });
            }
            return customers;
        });
    }
    count(brandId_1) {
        return __awaiter(this, arguments, void 0, function* (brandId, filters = {}) {
            var _a;
            const search = (_a = filters.search) === null || _a === void 0 ? void 0 : _a.trim();
            const restaurantId = filters.restaurantId;
            const whereClause = {
                brandId,
            };
            if (search) {
                whereClause.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                ];
            }
            if (restaurantId) {
                whereClause.profiles = {
                    some: {
                        restaurantId,
                    },
                };
            }
            return prisma_1.prisma.customer.count({
                where: whereClause,
            });
        });
    }
}
exports.CustomerRepository = CustomerRepository;
//# sourceMappingURL=customer.repository.js.map