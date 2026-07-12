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
exports.SegmentService = void 0;
const prisma_1 = require("../../lib/prisma");
class SegmentService {
    // Create a new segment definition
    createSegment(brandId, name, description, criteria) {
        return __awaiter(this, void 0, void 0, function* () {
            const existing = yield prisma_1.prisma.segment.findFirst({
                where: { brandId, name: { equals: name, mode: 'insensitive' } },
            });
            if (existing) {
                throw new Error(`A segment with the name "${name}" already exists`);
            }
            const segment = yield prisma_1.prisma.segment.create({
                data: {
                    brandId,
                    name,
                    description,
                    criteriaJson: criteria,
                },
            });
            // Run initial evaluation
            yield this.evaluateSegment(segment.id, brandId);
            return segment;
        });
    }
    // Get segments list for a brand with membership sizes
    getSegments(brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.segment.findMany({
                where: { brandId },
                include: {
                    _count: {
                        select: { customers: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
        });
    }
    // Delete segment template
    deleteSegment(brandId, segmentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const segment = yield prisma_1.prisma.segment.findFirst({
                where: { id: segmentId, brandId },
            });
            if (!segment) {
                throw new Error('Segment not found or unauthorized');
            }
            yield prisma_1.prisma.segment.delete({
                where: { id: segmentId },
            });
        });
    }
    // Evaluate segment rules, query matching customers, and sync memberships
    evaluateSegment(segmentId, brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            const segment = yield prisma_1.prisma.segment.findUnique({
                where: { id: segmentId },
            });
            if (!segment || segment.brandId !== brandId) {
                throw new Error('Segment not found or unauthorized');
            }
            const criteria = (segment.criteriaJson || {});
            const now = new Date();
            // 1. Build dynamic query object
            const where = { brandId };
            const profileFilters = {};
            if (criteria.minSpend !== undefined && criteria.minSpend > 0) {
                profileFilters.totalSpend = { gte: criteria.minSpend };
            }
            if (criteria.minOrders !== undefined && criteria.minOrders > 0) {
                profileFilters.totalOrders = { gte: criteria.minOrders };
            }
            if (criteria.lastVisitDaysAgo !== undefined && criteria.lastVisitDaysAgo > 0) {
                const dateLimit = new Date();
                dateLimit.setDate(now.getDate() - criteria.lastVisitDaysAgo);
                profileFilters.lastVisit = { lte: dateLimit };
            }
            if (criteria.visitedWithinDays !== undefined && criteria.visitedWithinDays > 0) {
                const dateLimit = new Date();
                dateLimit.setDate(now.getDate() - criteria.visitedWithinDays);
                profileFilters.lastVisit = Object.assign(Object.assign({}, profileFilters.lastVisit), { gte: dateLimit });
            }
            if (Object.keys(profileFilters).length > 0) {
                where.profiles = {
                    some: profileFilters,
                };
            }
            // JSON metadata tags checks
            if (criteria.dietary && criteria.dietary !== 'None') {
                where.metadataJson = {
                    path: ['dietary'],
                    equals: criteria.dietary,
                };
            }
            if (criteria.seating && criteria.seating !== 'None') {
                where.metadataJson = Object.assign(Object.assign({}, where.metadataJson), { path: ['seating'], equals: criteria.seating });
            }
            // 2. Query matching customers
            const matchingCustomers = yield prisma_1.prisma.customer.findMany({
                where,
                select: { id: true },
            });
            const customerIds = matchingCustomers.map((c) => c.id);
            // 3. Sync memberships inside transaction
            yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // Clear old segment memberships
                yield tx.customerSegment.deleteMany({
                    where: { segmentId },
                });
                // Insert new memberships
                if (customerIds.length > 0) {
                    yield tx.customerSegment.createMany({
                        data: customerIds.map((customerId) => ({
                            segmentId,
                            customerId,
                        })),
                    });
                }
            }));
            return customerIds.length;
        });
    }
    // Evaluate all segments for a brand (typically run via cron)
    evaluateAllSegmentsForBrand(brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            const segments = yield prisma_1.prisma.segment.findMany({
                where: { brandId },
                select: { id: true },
            });
            for (const segment of segments) {
                try {
                    yield this.evaluateSegment(segment.id, brandId);
                }
                catch (err) {
                    console.error(`Failed to evaluate segment ${segment.id}:`, err);
                }
            }
        });
    }
    // Fetch segment members list
    getSegmentMembers(brandId, segmentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const memberships = yield prisma_1.prisma.customerSegment.findMany({
                where: {
                    segmentId,
                    segment: { brandId },
                },
                include: {
                    customer: {
                        include: {
                            profiles: true,
                        },
                    },
                },
            });
            return memberships.map((m) => m.customer);
        });
    }
}
exports.SegmentService = SegmentService;
//# sourceMappingURL=segment.service.js.map