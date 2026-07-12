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
exports.CampaignController = void 0;
const prisma_1 = require("../../lib/prisma");
const campaign_service_1 = require("../../services/crm/campaign.service");
const zod_1 = require("zod");
const CreateCampaignSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(50),
    channel: zod_1.z.enum(['SMS', 'EMAIL', 'PUSH']),
    segmentId: zod_1.z.string().uuid('Invalid segment ID').optional().nullable(),
    templateSubject: zod_1.z.string().max(100).optional().nullable(),
    templateBody: zod_1.z.string().min(5, 'Message body must be at least 5 characters').max(1000),
    scheduledAt: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid scheduled date'),
});
const campaignService = new campaign_service_1.CampaignService();
class CampaignController {
    // Get all campaigns for brand
    getCampaigns(req, res) {
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
                const campaigns = yield campaignService.getCampaigns(brandId);
                res.status(200).json({ campaigns });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Create new campaign
    createCampaign(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                if (!user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const validation = CreateCampaignSchema.safeParse(req.body);
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
                const campaign = yield campaignService.createCampaign(brandId, {
                    name: validation.data.name,
                    channel: validation.data.channel,
                    segmentId: validation.data.segmentId,
                    templateSubject: validation.data.templateSubject,
                    templateBody: validation.data.templateBody,
                    scheduledAt: new Date(validation.data.scheduledAt),
                });
                res.status(201).json({ message: 'Campaign queued successfully', campaign });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Delete campaign template
    deleteCampaign(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const campaignId = req.params['id'];
                if (!user || !campaignId) {
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
                yield campaignService.deleteCampaign(brandId, campaignId);
                res.status(200).json({ message: 'Campaign deleted successfully' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // Get campaign logs
    getCampaignLogs(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const user = req.user;
                const campaignId = req.params['id'];
                if (!user || !campaignId) {
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
                const logs = yield campaignService.getCampaignLogs(campaignId, brandId);
                res.status(200).json({ logs });
            }
            catch (err) {
                res.status(505).json({ error: err.message });
            }
        });
    }
    // Get aggregate stats for campaigns
    getCampaignStats(req, res) {
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
                const campaigns = yield prisma_1.prisma.campaign.findMany({
                    where: { brandId }
                });
                let totalSent = 0;
                let totalFailed = 0;
                let emailCount = 0;
                let smsCount = 0;
                let completedCount = 0;
                let pendingCount = 0;
                for (const camp of campaigns) {
                    totalSent += camp.sentCount;
                    totalFailed += camp.failedCount;
                    if (camp.channel === 'EMAIL')
                        emailCount++;
                    else if (camp.channel === 'SMS')
                        smsCount++;
                    if (camp.status === 'COMPLETED')
                        completedCount++;
                    else if (camp.status === 'QUEUED' || camp.status === 'SENDING')
                        pendingCount++;
                }
                res.status(200).json({
                    totalCampaigns: campaigns.length,
                    totalSent,
                    totalFailed,
                    emailCount,
                    smsCount,
                    completedCount,
                    pendingCount,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.CampaignController = CampaignController;
//# sourceMappingURL=campaign.controller.js.map