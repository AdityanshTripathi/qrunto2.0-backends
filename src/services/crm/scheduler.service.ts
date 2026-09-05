import { prisma } from '../../lib/prisma';
import { SegmentService } from './segment.service';
import { CampaignService } from './campaign.service';
import { OccasionService } from './occasion.service';
import { sharedRedis, RedisConnection } from '../../lib/redis';
import { randomUUID } from 'node:crypto';
import { logSafeError, logStructured, safeError, StageError } from '../../lib/safe-error';

const segmentService = new SegmentService();
const campaignService = new CampaignService();
const occasionService = new OccasionService();
let schedulerInterval: NodeJS.Timeout | null = null;
let campaignInterval: NodeJS.Timeout | null = null;
let occasionInterval: NodeJS.Timeout | null = null;
const MAX_ATTEMPTS = 3;
const FAILURE_STATE_TTL = 7 * 24 * 60 * 60;
const DEAD_LETTER = 'crm:scheduler:dead';
const METRICS = {
  success: 'crm:scheduler:metrics:success',
  failure: 'crm:scheduler:metrics:failure',
  retry: 'crm:scheduler:metrics:retry',
};
const permanentCodes = new Set([
  'P1000', 'P2021', 'P2022', 'WRONGPASS', 'NOAUTH', 'NOPERM',
  'REDIS_CONFIG_MISSING', 'REDIS_CONFIG_INVALID',
]);
const DEAD_SCRIPT = [
  '-- crm-dead-letter',
  'redis.call(set, KEYS[1], failed, EX, ARGV[1])',
  'redis.call(rpush, KEYS[2], ARGV[2])',
  'redis.call(del, KEYS[3], KEYS[4])',
  'return 1',
].join('\n');

export function shouldStartLocalScheduler(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.VERCEL && env.ENABLE_LOCAL_CRM_SCHEDULER === 'true';
}

export class CRMScheduler {
  static async getStatus(suppliedStore?: RedisConnection): Promise<{
    running: boolean; success: number; failures: number; retries: number; deadLetter: number;
  }> {
    const store = suppliedStore ?? await sharedRedis.commands();
    const [lock, success, failures, retries, deadLetter] = await Promise.all([
      store.get('crm:scheduler:lock'), store.get(METRICS.success),
      store.get(METRICS.failure), store.get(METRICS.retry), store.lLen(DEAD_LETTER),
    ]);
    return {
      running: Boolean(lock), success: Number(success || 0), failures: Number(failures || 0),
      retries: Number(retries || 0), deadLetter,
    };
  }

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
        stage = `jobs.${job.name}`;
        if (await this.runJob(store, job, bucket)) ran = true;
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

  private static async redis<T>(stage: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw error instanceof StageError ? error : new StageError(stage, error);
    }
  }

  private static async runJob(
    store: RedisConnection,
    job: { name: string; period: number; run: () => Promise<unknown> },
    bucket: number,
  ): Promise<boolean> {
    const prefix = `crm:scheduler:${job.name}:${bucket}`;
    const checkpoint = prefix;
    const attemptsKey = `crm:scheduler:${job.name}:attempts`;
    const retryAtKey = `crm:scheduler:${job.name}:retry-at`;
    const failedKey = `${prefix}:failed`;
    const readStage = `redis.${job.name}.checkpoint.read`;
    if (await this.redis(readStage, () => store.get(checkpoint))
      || await this.redis(readStage, () => store.get(failedKey))) return false;
    const retryAt = Number(await this.redis(`redis.${job.name}.retry.read`,
      () => store.get(retryAtKey)) || 0);
    if (retryAt > Date.now()) return false;

    try {
      await job.run();
    } catch (error) {
      await this.recordFailure(store, job, bucket, error, attemptsKey, retryAtKey, failedKey);
      throw error;
    }
    await this.redis(`redis.${job.name}.checkpoint.write`,
      () => store.set(checkpoint, 'done', { EX: job.period * 2 }));
    await store.del([attemptsKey, retryAtKey]);
    await this.metric(store, METRICS.success);
    return true;
  }

  private static async recordFailure(
    store: RedisConnection,
    job: { name: string; period: number }, bucket: number, error: unknown,
    attemptsKey: string, retryAtKey: string, failedKey: string,
  ): Promise<void> {
    const failure = safeError(error);
    const permanent = permanentCodes.has(failure.code);
    const attempts = permanent ? MAX_ATTEMPTS : await store.incr(attemptsKey);
    await this.metric(store, METRICS.failure);
    if (!permanent) await store.expire(attemptsKey, FAILURE_STATE_TTL);

    if (attempts >= MAX_ATTEMPTS) {
      const dead = JSON.stringify({
        job: job.name, bucket, attempts, code: failure.code, failedAt: Date.now(),
      });
      await store.eval(DEAD_SCRIPT, {
        keys: [failedKey, DEAD_LETTER, attemptsKey, retryAtKey],
        arguments: [String(FAILURE_STATE_TTL), dead],
      });
      logSafeError(`jobs.${job.name}.dead-letter`, error, 'crm', {
        status: 'dead-letter', job: job.name, attempt: attempts,
      });
      return;
    }

    const delayMs = 1_000 * (2 ** (attempts - 1));
    await store.set(retryAtKey, String(Date.now() + delayMs), { EX: FAILURE_STATE_TTL });
    await this.metric(store, METRICS.retry);
    logSafeError(`jobs.${job.name}.retry`, error, 'crm', {
      status: 'retrying', job: job.name, attempt: attempts, retryInMs: delayMs,
    });
  }

  private static async metric(store: RedisConnection, key: string): Promise<void> {
    try {
      await store.incr(key);
    } catch (error) {
      logSafeError('scheduler.metrics', error, 'crm');
    }
  }

  // Start the background evaluation job
  static start(): void {
    if (!shouldStartLocalScheduler()) return;
    if (schedulerInterval) {
      logStructured('info', 'crm', 'scheduler.start', 'skipped', 'Background scheduler already running');
      return;
    }

    logStructured('info', 'crm', 'scheduler.start', 'started', 'Background scheduler initialized');

    // Run evaluations once on startup
    this.runEvaluations().catch(err => logSafeError('startup.segments', err));
    campaignService.processQueuedCampaigns().catch(err => logSafeError('startup.campaigns', err));
    occasionService.checkAndSendOccasionMessages().catch(err => logSafeError('startup.occasions', err));

    // Run every 4 hours (4 * 60 * 60 * 1000 ms)
    const intervalMs = 4 * 60 * 60 * 1000;
    schedulerInterval = setInterval(() => {
      this.runEvaluations().catch(err => logSafeError('interval.segments', err));
    }, intervalMs);

    // Run campaign scanner every 1 minute (60 * 1000 ms)
    campaignInterval = setInterval(() => {
      campaignService.processQueuedCampaigns().catch(err => logSafeError('interval.campaigns', err));
    }, 60 * 1000);

    // Run occasion checker every 24 hours (24 * 60 * 60 * 1000 ms)
    const occasionIntervalMs = 24 * 60 * 60 * 1000;
    occasionInterval = setInterval(() => {
      occasionService.checkAndSendOccasionMessages().catch(err => logSafeError('interval.occasions', err));
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
    logStructured('info', 'crm', 'scheduler.stop', 'stopped', 'Background scheduler stopped');
  }

  // Iterate over brands and trigger evaluation
  private static async runEvaluations(): Promise<void> {
    try {
      const brands = await prisma.brand.findMany({
        select: { id: true, name: true },
      });

      for (const brand of brands) {
        await segmentService.evaluateAllSegmentsForBrand(brand.id);
      }

      logStructured('info', 'crm', 'segments.evaluate', 'completed', 'Segment evaluation completed',
        { brandCount: brands.length });
    } catch (err) {
      throw err;
    }
  }
}
