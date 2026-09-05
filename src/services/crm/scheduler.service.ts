import { prisma } from '../../lib/prisma';
import { SegmentService } from './segment.service';
import { CampaignService } from './campaign.service';
import { OccasionService } from './occasion.service';
import { sharedRedis, RedisConnection } from '../../lib/redis';
import { randomUUID } from 'node:crypto';
import { logSafeError, StageError } from '../../lib/safe-error';

const segmentService = new SegmentService();
const campaignService = new CampaignService();
const occasionService = new OccasionService();
let schedulerInterval: NodeJS.Timeout | null = null;
let campaignInterval: NodeJS.Timeout | null = null;
let occasionInterval: NodeJS.Timeout | null = null;

export function shouldStartLocalScheduler(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.VERCEL && env.ENABLE_LOCAL_CRM_SCHEDULER === 'true';
}

export class CRMScheduler {
  // One awaited cycle. Redis coordinates separate serverless instances.
  static async runCycle(now = new Date(), suppliedStore?: RedisConnection): Promise<'completed' | 'skipped'> {
    let store: RedisConnection | undefined = suppliedStore;
    let stage = 'redis.connect';
    let failed = false;
    const lockKey = 'crm:scheduler:lock';
    const token = randomUUID();
    let locked = false;
    try {
      store ??= await sharedRedis.commands();
      stage = 'redis.lock.acquire';
      // Longer than Vercel's configured 300-second invocation limit.
      locked = await store.set(lockKey, token, { NX: true, EX: 600 }) === 'OK';
      if (!locked) return 'skipped';

      const jobs = [
        { name: 'segments', period: 4 * 60 * 60, run: () => this.runEvaluations() },
        { name: 'campaigns', period: 60, run: () => campaignService.processQueuedCampaigns() },
        { name: 'occasions', period: 24 * 60 * 60, run: () => occasionService.checkAndSendOccasionMessages() },
      ];
      let ran = false;
      for (const job of jobs) {
        const bucket = Math.floor(now.getTime() / (job.period * 1000));
        const key = `crm:scheduler:${job.name}:${bucket}`;
        stage = `redis.${job.name}.checkpoint.read`;
        if (await store.get(key)) continue;
        stage = `jobs.${job.name}`;
        await job.run();
        stage = `redis.${job.name}.checkpoint.write`;
        await store.set(key, 'done', { EX: job.period * 2 });
        ran = true;
      }
      return ran ? 'completed' : 'skipped';
    } catch (error) {
      failed = true;
      throw error instanceof StageError ? error : new StageError(stage, error);
    } finally {
      if (locked && store) {
        try {
          await store.eval(
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
          { keys: [lockKey], arguments: [token] },
          );
        } catch (error) {
          if (failed) logSafeError('redis.lock.release', error);
          else throw new StageError('redis.lock.release', error);
        }
      }
    }
  }

  // Start the background evaluation job
  static start(): void {
    if (!shouldStartLocalScheduler()) return;
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
      console.error('[CRM Scheduler] Periodic segment evaluation failed');
      throw err;
    }
  }
}
