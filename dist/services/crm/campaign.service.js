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
exports.CampaignService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class CampaignService {
    // Create a new messaging campaign
    createCampaign(brandId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            return prisma_1.prisma.campaign.create({
                data: {
                    brandId,
                    name: data.name,
                    channel: data.channel,
                    segmentId: (_a = data.segmentId) !== null && _a !== void 0 ? _a : null,
                    templateSubject: (_b = data.templateSubject) !== null && _b !== void 0 ? _b : null,
                    templateBody: data.templateBody,
                    status: client_1.CampaignStatus.QUEUED, // auto-queue upon creation
                    scheduledAt: data.scheduledAt,
                },
            });
        });
    }
    // Get campaigns list for brand
    getCampaigns(brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.campaign.findMany({
                where: { brandId },
                include: {
                    segment: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
        });
    }
    // Delete campaign
    deleteCampaign(brandId, campaignId) {
        return __awaiter(this, void 0, void 0, function* () {
            const campaign = yield prisma_1.prisma.campaign.findFirst({
                where: { id: campaignId, brandId },
            });
            if (!campaign) {
                throw new Error('Campaign not found or unauthorized');
            }
            yield prisma_1.prisma.campaign.delete({
                where: { id: campaignId },
            });
        });
    }
    // Process and dispatch a campaign asynchronously
    sendCampaign(campaignId, brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            const campaign = yield prisma_1.prisma.campaign.findFirst({
                where: { id: campaignId, brandId, status: client_1.CampaignStatus.QUEUED },
            });
            if (!campaign)
                return;
            // 1. Mark campaign as SENDING
            yield prisma_1.prisma.campaign.update({
                where: { id: campaignId },
                data: { status: client_1.CampaignStatus.SENDING },
            });
            try {
                // 2. Fetch targets
                let targetCustomers = [];
                if (campaign.segmentId) {
                    const memberships = yield prisma_1.prisma.customerSegment.findMany({
                        where: { segmentId: campaign.segmentId },
                        include: { customer: true },
                    });
                    targetCustomers = memberships.map((m) => m.customer);
                }
                else {
                    targetCustomers = yield prisma_1.prisma.customer.findMany({
                        where: { brandId },
                    });
                }
                if (targetCustomers.length === 0) {
                    yield prisma_1.prisma.campaign.update({
                        where: { id: campaignId },
                        data: { status: client_1.CampaignStatus.COMPLETED },
                    });
                    return;
                }
                console.log(`[Campaign Dispatcher] Starting Campaign "${campaign.name}" (${campaign.id}). Targets: ${targetCustomers.length}`);
                // 3. Create pending logs
                yield prisma_1.prisma.campaignLog.createMany({
                    data: targetCustomers.map((c) => ({
                        campaignId,
                        customerId: c.id,
                        status: client_1.CampaignLogStatus.PENDING,
                    })),
                });
                // 4. Dispatch async (evaluate customer by customer)
                let sentCount = 0;
                let failedCount = 0;
                for (const customer of targetCustomers) {
                    try {
                        // Token substitution
                        const interpolatedBody = campaign.templateBody
                            .replace(/\{\{name\}\}/gi, customer.name || 'Valued Guest')
                            .replace(/\{\{phone\}\}/gi, customer.phone || '')
                            .replace(/\{\{email\}\}/gi, customer.email || '');
                        // Simulate dispatch based on channel type
                        if (campaign.channel === client_1.CampaignChannel.EMAIL) {
                            if (!customer.email) {
                                throw new Error('Customer does not have a linked email address');
                            }
                            console.log(`[SMTP Mailer Simulator] To: ${customer.email} | Sub: ${campaign.templateSubject} | Msg: ${interpolatedBody}`);
                        }
                        else if (campaign.channel === client_1.CampaignChannel.SMS) {
                            console.log(`[SMS Gateway Simulator] To: ${customer.phone} | Msg: ${interpolatedBody}`);
                        }
                        // Mark log as SENT
                        yield prisma_1.prisma.campaignLog.updateMany({
                            where: { campaignId, customerId: customer.id },
                            data: { status: client_1.CampaignLogStatus.SENT },
                        });
                        sentCount++;
                    }
                    catch (err) {
                        console.error(`[Campaign Dispatcher] Failed to dispatch to customer ${customer.id}:`, err.message);
                        // Mark log as FAILED
                        yield prisma_1.prisma.campaignLog.updateMany({
                            where: { campaignId, customerId: customer.id },
                            data: {
                                status: client_1.CampaignLogStatus.FAILED,
                                errorDetails: err.message,
                            },
                        });
                        failedCount++;
                    }
                    // Periodically update campaign progress counts
                    yield prisma_1.prisma.campaign.update({
                        where: { id: campaignId },
                        data: { sentCount, failedCount },
                    });
                }
                // 5. Complete campaign
                yield prisma_1.prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: client_1.CampaignStatus.COMPLETED },
                });
                console.log(`[Campaign Dispatcher] Campaign "${campaign.name}" completed. Sent: ${sentCount}, Failed: ${failedCount}`);
            }
            catch (err) {
                console.error(`[Campaign Dispatcher] Campaign execution crashed:`, err);
                yield prisma_1.prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: client_1.CampaignStatus.FAILED },
                });
            }
        });
    }
    // Find and process queued campaigns due for sending
    processQueuedCampaigns() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const queuedCampaigns = yield prisma_1.prisma.campaign.findMany({
                where: {
                    status: client_1.CampaignStatus.QUEUED,
                    scheduledAt: { lte: now },
                },
            });
            for (const campaign of queuedCampaigns) {
                // Process asynchronously
                this.sendCampaign(campaign.id, campaign.brandId).catch((err) => {
                    console.error(`[Campaign Scheduler] Async dispatch failed for ${campaign.id}:`, err);
                });
            }
        });
    }
    // Fetch campaign logs metrics
    getCampaignLogs(campaignId, brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            const campaign = yield prisma_1.prisma.campaign.findFirst({
                where: { id: campaignId, brandId },
            });
            if (!campaign) {
                throw new Error('Campaign not found or unauthorized');
            }
            return prisma_1.prisma.campaignLog.findMany({
                where: { campaignId },
                include: {
                    customer: { select: { name: true, phone: true, email: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
        });
    }
}
exports.CampaignService = CampaignService;
//# sourceMappingURL=campaign.service.js.map