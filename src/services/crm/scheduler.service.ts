import { prisma } from '../../lib/prisma';
import { SegmentService } from './segment.service';
import { CampaignService } from './campaign.service';
import { OccasionService } from './occasion.service';

const segmentService = new SegmentService();
const campaignService = new CampaignService();
const occasionService = new OccasionService();
let schedulerInterval: NodeJS.Timeout | null = null;
let campaignInterval: NodeJS.Timeout | null = null;
let occasionInterval: NodeJS.Timeout | null = null;

export class CRMScheduler {
  // Start the background evaluation job
  static start(): void {
    if (schedulerInterval) {
      console.log('[CRM Scheduler] Background scheduler is already running.');
      return;
    }

    console.log('[CRM Scheduler] Initializing background CRM segment evaluator...');

    // Run evaluations once on startup
    this.runEvaluations().catch(err => console.error('[CRM Scheduler] Startup evaluations failed:', err));
    campaignService.processQueuedCampaigns().catch(err => console.error('[CRM Scheduler] Startup campaigns failed:', err));
    occasionService.checkAndSendOccasionMessages().catch(err => console.error('[CRM Scheduler] Startup occasions failed:', err));

    // Run every 4 hours (4 * 60 * 60 * 1000 ms)
    const intervalMs = 4 * 60 * 60 * 1000;
    schedulerInterval = setInterval(() => {
      this.runEvaluations().catch(err => console.error('[CRM Scheduler] Interval evaluations failed:', err));
    }, intervalMs);

    // Run campaign scanner every 1 minute (60 * 1000 ms)
    campaignInterval = setInterval(() => {
      campaignService.processQueuedCampaigns().catch(err => console.error('[CRM Scheduler] Interval campaigns failed:', err));
    }, 60 * 1000);

    // Run occasion checker every 24 hours (24 * 60 * 60 * 1000 ms)
    const occasionIntervalMs = 24 * 60 * 60 * 1000;
    occasionInterval = setInterval(() => {
      occasionService.checkAndSendOccasionMessages().catch(err => console.error('[CRM Scheduler] Interval occasions failed:', err));
    }, occasionIntervalMs);
  }

  // Stop background jobs (for clean shutdowns)
  static stop(): void {
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
  private static async runEvaluations(): Promise<void> {
    console.log('[CRM Scheduler] Running periodic segment evaluations...');
    try {
      const brands = await prisma.brand.findMany({
        select: { id: true, name: true },
      });

      for (const brand of brands) {
        console.log(`[CRM Scheduler] Evaluating segments for Brand: ${brand.name} (${brand.id})`);
        await segmentService.evaluateAllSegmentsForBrand(brand.id);
      }

      console.log('[CRM Scheduler] Segment evaluation batch completed successfully.');
    } catch (err) {
      console.error('[CRM Scheduler] Error during periodic segment evaluation:', err);
    }
  }
}
