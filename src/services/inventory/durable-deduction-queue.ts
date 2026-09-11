import { randomUUID } from 'node:crypto';
import { logSafeError, logStructured } from '../../lib/safe-error';
import { requestIdOrNew, sanitizeRequestId, withRequestId } from '../../lib/request-context';

export interface DeductionJob {
  requestId?: string;
  orderId: string;
  restaurantId: string;
  attempts: number;
  notBefore: number;
}

export interface QueueStore {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null>;
  lMove(source: string, destination: string, sourceDirection: 'LEFT' | 'RIGHT', destinationDirection: 'LEFT' | 'RIGHT'): Promise<string | null>;
  rPush(key: string, value: string): Promise<number>;
  lRem(key: string, count: number, value: string): Promise<number>;
  lLen(key: string): Promise<number>;
  incr(key: string): Promise<number>;
}

const READY = 'inventory:deduction:ready';
const PROCESSING = 'inventory:deduction:processing';
const DEAD = 'inventory:deduction:dead';
const METRICS = {
  success: 'inventory:deduction:metrics:success',
  failure: 'inventory:deduction:metrics:failure',
  retry: 'inventory:deduction:metrics:retry',
};

const ENQUEUE_SCRIPT = [
  '-- inventory-enqueue',
  'if redis.call(\'exists\', KEYS[1]) == 1 then return 0 end',
  'redis.call(\'set\', KEYS[1], \'queued\')',
  'redis.call(\'rpush\', KEYS[2], ARGV[1])',
  'return 1',
].join('\n');
const RELEASE_SCRIPT = [
  '-- inventory-lock-release',
  'if redis.call(\'get\', KEYS[1]) == ARGV[1] then return redis.call(\'del\', KEYS[1]) end',
  'return 0',
].join('\n');
const DEAD_SCRIPT = [
  '-- inventory-dead-letter',
  'redis.call(\'set\', KEYS[1], \'failed\', \'EX\', ARGV[3])',
  'redis.call(\'rpush\', KEYS[2], ARGV[1])',
  'redis.call(\'lrem\', KEYS[3], 1, ARGV[2])',
  'return 1',
].join('\n');

export class DurableDeductionQueue {
  private running = false;
  private recovered = false;
  private retryTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: () => Promise<QueueStore>,
    private readonly handler: (job: DeductionJob) => Promise<void>,
    private readonly options = { maxAttempts: 5, baseDelayMs: 1_000, lockSeconds: 300, batchSize: 25, autoStart: true },
    private readonly onTerminalFailure?: (job: DeductionJob, error: unknown) => Promise<void>,
  ) {}

  async enqueue(orderId: string, restaurantId: string): Promise<boolean> {
    const job: DeductionJob = { orderId, restaurantId, attempts: 0, notBefore: 0, requestId: requestIdOrNew() };
    const result = await (await this.store()).eval(ENQUEUE_SCRIPT, {
      keys: [this.jobKey(job), READY],
      arguments: [JSON.stringify(job)],
    });
    if (Number(result) === 1) {
      logStructured('info', 'inventory', 'inventory.deduction.ready', 'ready',
        'Inventory job queued', { orderId, restaurantId });
    }
    if (Number(result) === 1 && this.options.autoStart) void this.drain();
    return Number(result) === 1;
  }

  async drain(): Promise<void> {
    return withRequestId(requestIdOrNew(), () => this.drainWithContext());
  }

  private async drainWithContext(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const store = await this.store();
      if (!this.recovered) {
        await this.recover(store);
        this.recovered = true;
      }
      for (let count = 0; count < this.options.batchSize; count++) {
        const raw = await store.lMove(READY, PROCESSING, 'LEFT', 'RIGHT');
        if (!raw || !(await this.process(store, raw))) break;
      }
    } catch (error) {
      // A command may have claimed a job before its response was lost. Recover
      // processing entries again on the next drain, including warm reuse.
      this.recovered = false;
      this.logFailure('inventory.queue.drain', error);
      this.schedule(this.options.baseDelayMs);
    } finally {
      this.running = false;
    }
  }

  async getStatus(): Promise<{
    ready: number; processing: number; deadLetter: number;
    success: number; failures: number; retries: number;
  }> {
    const store = await this.store();
    const [ready, processing, deadLetter, success, failures, retries] = await Promise.all([
      store.lLen(READY), store.lLen(PROCESSING), store.lLen(DEAD),
      store.get(METRICS.success), store.get(METRICS.failure), store.get(METRICS.retry),
    ]);
    return {
      ready, processing, deadLetter, success: Number(success || 0),
      failures: Number(failures || 0), retries: Number(retries || 0),
    };
  }

  private async recover(store: QueueStore): Promise<void> {
    for (let count = 0; count < this.options.batchSize; count++) {
      const raw = await store.lMove(PROCESSING, READY, 'LEFT', 'RIGHT');
      if (!raw) break;
    }
  }

  private async process(store: QueueStore, raw: string): Promise<boolean> {
    let job: DeductionJob;
    try {
      job = JSON.parse(raw) as DeductionJob;
      if (!job.orderId || !job.restaurantId) throw new Error('Invalid inventory job');
    } catch (error) {
      await store.rPush(DEAD, raw);
      await store.lRem(PROCESSING, 1, raw);
      this.logFailure('inventory.queue.payload', error);
      return true;
    }
    job.requestId = sanitizeRequestId(job.requestId) ?? randomUUID();
    return withRequestId(job.requestId, () => this.processJob(store, raw, job));
  }

  private async processJob(store: QueueStore, raw: string, job: DeductionJob): Promise<boolean> {
    const status = await store.get(this.jobKey(job));
    if (status === 'done' || status === 'failed') {
      await store.lRem(PROCESSING, 1, raw);
      return true;
    }
    const delay = job.notBefore - Date.now();
    if (delay > 0) {
      await this.requeue(store, raw, JSON.stringify(job));
      this.schedule(delay);
      return false;
    }
    const lockKey = `inventory:deduction:lock:${job.restaurantId}:${job.orderId}`;
    const token = randomUUID();
    const locked = await store.set(lockKey, token, { NX: true, EX: this.options.lockSeconds });
    if (locked !== 'OK') {
      await this.requeue(store, raw, JSON.stringify(job));
      this.schedule(this.options.baseDelayMs);
      return false;
    }
    try {
      logStructured('info', 'inventory', 'inventory.deduction.processing', 'processing',
        'Inventory job processing', { orderId: job.orderId, restaurantId: job.restaurantId, attempt: job.attempts + 1 });
      await this.handler(job);
      await store.set(this.jobKey(job), 'done', { EX: 30 * 24 * 60 * 60 });
      await store.lRem(PROCESSING, 1, raw);
      await this.metric(store, METRICS.success);
      logStructured('info', 'inventory', 'inventory.deduction.complete', 'completed',
        'Inventory job completed', { orderId: job.orderId, restaurantId: job.restaurantId });
    } catch (error) {
      const attempts = job.attempts + 1;
      await this.metric(store, METRICS.failure);
      if (attempts >= this.options.maxAttempts) {
        this.logFailure('inventory.deduction.dead-letter', error, attempts, job);
        await store.eval(DEAD_SCRIPT, {
          keys: [this.jobKey(job), DEAD, PROCESSING],
          arguments: [JSON.stringify({ ...job, attempts }), raw, String(7 * 24 * 60 * 60)],
        });
        await this.auditTerminalFailure(job, error);
      } else {
        this.logFailure('inventory.deduction.retry', error, attempts, job);
        await this.metric(store, METRICS.retry);
        const retryDelay = this.backoff(attempts);
        const retry = { ...job, attempts, notBefore: Date.now() + retryDelay };
        await this.requeue(store, raw, JSON.stringify(retry));
        this.schedule(retryDelay);
        return false;
      }
    } finally {
      await store.eval(RELEASE_SCRIPT, { keys: [lockKey], arguments: [token] });
    }
    return true;
  }

  private async requeue(store: QueueStore, oldRaw: string, newRaw: string): Promise<void> {
    await store.rPush(READY, newRaw);
    await store.lRem(PROCESSING, 1, oldRaw);
  }

  private backoff(attempts: number): number {
    return this.options.baseDelayMs * (2 ** (attempts - 1));
  }

  private jobKey(job: Pick<DeductionJob, 'orderId' | 'restaurantId'>): string {
    return `inventory:deduction:job:${job.restaurantId}:${job.orderId}`;
  }

  private schedule(delay: number): void {
    if (!this.options.autoStart) return;
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.drain();
    }, Math.max(1, delay));
    this.retryTimer.unref?.();
  }

  private logFailure(stage: string, error: unknown, attempt?: number, job?: DeductionJob): void {
    logSafeError(stage, error, 'inventory', {
      status: stage.endsWith('.retry') ? 'retrying'
        : stage.endsWith('.dead-letter') ? 'dead-letter' : 'failed',
      ...(attempt ? { attempt } : {}),
      ...(job ? { orderId: job.orderId, restaurantId: job.restaurantId } : {}),
    });
  }

  private async metric(store: QueueStore, key: string): Promise<void> {
    try {
      await store.incr(key);
    } catch (error) {
      this.logFailure('inventory.queue.metrics', error);
    }
  }

  private async auditTerminalFailure(job: DeductionJob, error: unknown): Promise<void> {
    if (!this.onTerminalFailure) return;
    try {
      await this.onTerminalFailure(job, error);
    } catch (auditError) {
      this.logFailure('inventory.queue.audit', auditError);
    }
  }
}
