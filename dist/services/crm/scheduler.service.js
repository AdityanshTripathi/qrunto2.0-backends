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
exports.CRMScheduler = void 0;
const prisma_1 = require("../../lib/prisma");
const segment_service_1 = require("./segment.service");
const campaign_service_1 = require("./campaign.service");
const occasion_service_1 = require("./occasion.service");
const segmentService = new segment_service_1.SegmentService();
const campaignService = new campaign_service_1.CampaignService();
const occasionService = new occasion_service_1.OccasionService();
let schedulerInterval = null;
let campaignInterval = null;
let occasionInterval = null;
class CRMScheduler {
    // Start the background evaluation job
    static start() {
        if (schedulerInterval) {
            console.log('[CRM Scheduler] Background scheduler is already running.');
            return;
        }
        console.log('[CRM Scheduler] Initializing background CRM segment evaluator...');
        // Run evaluations once on startup
        this.runEvaluations();
        campaignService.processQueuedCampaigns();
        occasionService.checkAndSendOccasionMessages();
        // Run every 4 hours (4 * 60 * 60 * 1000 ms)
        const intervalMs = 4 * 60 * 60 * 1000;
        schedulerInterval = setInterval(() => {
            this.runEvaluations();
        }, intervalMs);
        // Run campaign scanner every 1 minute (60 * 1000 ms)
        campaignInterval = setInterval(() => {
            campaignService.processQueuedCampaigns();
        }, 60 * 1000);
        // Run occasion checker every 24 hours (24 * 60 * 60 * 1000 ms)
        const occasionIntervalMs = 24 * 60 * 60 * 1000;
        occasionInterval = setInterval(() => {
            occasionService.checkAndSendOccasionMessages();
        }, occasionIntervalMs);
    }
    // Stop background jobs (for clean shutdowns)
    static stop() {
        if (schedulerInterval) {
            clearInterval(schedulerInterval);
            schedulerInterval = null;
        }
        if (campaignInterval) {
            clearInterval(campaignInterval);
            campaignInterval = null;
        }
        if (occasionInterval) {
            clearInterval(occasionInterval);
            occasionInterval = null;
        }
        console.log('[CRM Scheduler] Background scheduler stopped.');
    }
    // Iterate over brands and trigger evaluation
    static runEvaluations() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('[CRM Scheduler] Running periodic segment evaluations...');
            try {
                const brands = yield prisma_1.prisma.brand.findMany({
                    select: { id: true, name: true },
                });
                for (const brand of brands) {
                    console.log(`[CRM Scheduler] Evaluating segments for Brand: ${brand.name} (${brand.id})`);
                    yield segmentService.evaluateAllSegmentsForBrand(brand.id);
                }
                console.log('[CRM Scheduler] Segment evaluation batch completed successfully.');
            }
            catch (err) {
                console.error('[CRM Scheduler] Error during periodic segment evaluation:', err);
            }
        });
    }
}
exports.CRMScheduler = CRMScheduler;
//# sourceMappingURL=scheduler.service.js.map