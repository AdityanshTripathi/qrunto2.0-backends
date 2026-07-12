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
exports.SegmentController = void 0;
const prisma_1 = require("../../lib/prisma");
const segment_service_1 = require("../../services/crm/segment.service");
const rfm_service_1 = require("../../services/crm/rfm.service");
const zod_1 = require("zod");
const CreateSegmentSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(50),
    description: zod_1.z.string().max(200).optional().nullable(),
    criteria: zod_1.z.object({
        minSpend: zod_1.z.number().nonnegative().optional(),
        minOrders: zod_1.z.number().int().nonnegative().optional(),
        lastVisitDaysAgo: zod_1.z.number().int().nonnegative().optional(),
        visitedWithinDays: zod_1.z.number().int().nonnegative().optional(),
        dietary: zod_1.z.string().optional(),
        seating: zod_1.z.string().optional(),
    }),
});
const segmentService = new segment_service_1.SegmentService();
const rfmService = new rfm_service_1.RFMService();
class SegmentController {
    // Get all segments for brand
    getSegments(req, res) {
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
                const segments = yield segmentService.getSegments(brandId);
                res.status(200).json({ segments });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Create new segment campaign
    createSegment(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                if (!user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const validation = CreateSegmentSchema.safeParse(req.body);
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
                const { name, description, criteria } = validation.data;
                const segment = yield segmentService.createSegment(brandId, name, description !== null && description !== void 0 ? description : null, criteria);
                res.status(201).json({ message: 'Segment created and evaluated successfully', segment });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Delete segment campaign
    deleteSegment(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const segmentId = req.params['id'];
                if (!user || !segmentId) {
                    res.status(400).json({ error: 'Invalid parameters' });
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
                yield segmentService.deleteSegment(brandId, segmentId);
                res.status(200).json({ message: 'Segment deleted successfully' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Fetch segment members
    getSegmentMembers(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const segmentId = req.params['id'];
                if (!user || !segmentId) {
                    res.status(400).json({ error: 'Invalid parameters' });
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
                const members = yield segmentService.getSegmentMembers(brandId, segmentId);
                res.status(200).json({ members });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Force re-evaluate segment membership
    retraceSegment(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const segmentId = req.params['id'];
                if (!user || !segmentId) {
                    res.status(400).json({ error: 'Invalid parameters' });
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
                const size = yield segmentService.evaluateSegment(segmentId, brandId);
                res.status(200).json({ message: `Segment re-evaluated successfully. Members: ${size}`, size });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Get RFM scores breakdown
    getRFMScores(req, res) {
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
                const rfmResults = yield rfmService.calculateRFM(brandId);
                // Group results for matrix counting
                const matrix = {
                    'Champions': 0,
                    'Loyal Customers': 0,
                    'Recent / New': 0,
                    'Promising': 0,
                    'At Risk / Churn Alert': 0,
                    'Can\'t Lose Them': 0,
                    'Lost / Cold': 0,
                    'Need Attention': 0,
                };
                for (const item of rfmResults) {
                    const seg = item.segment;
                    if (matrix[seg] !== undefined) {
                        matrix[seg]++;
                    }
                    else {
                        matrix['Need Attention']++;
                    }
                }
                res.status(200).json({ rfm: rfmResults, matrix });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.SegmentController = SegmentController;
//# sourceMappingURL=segment.controller.js.map