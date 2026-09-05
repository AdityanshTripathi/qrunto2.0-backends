import { randomUUID } from 'node:crypto';
import { safeError } from '../../lib/safe-error';

export interface DeductionJob {
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
}

const READY = 'inventory:deduction:ready';
const PROCESSING = 'inventory:deduction:processing';
const DEAD = 'inventory:deduction:dead';

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
    const job: DeductionJob = { orderId, restaurantId, attempts: 0, notBefore: 0 };
    const result = await (await this.store()).eval(ENQUEUE_SCRIPT, {
      keys: [this.jobKey(job), READY],
      arguments: [JSON.stringify(job)],
    });
    if (Number(result) === 1 && this.options.autoStart) void this.drain();
    return Number(result) === 1;
  }

  async drain(): Promise<void> {
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
      this.logFailure('inventory.queue.drain', error);
      this.schedule(this.options.baseDelayMs);
    } finally {
      this.running = false;
    }
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
    const status = await store.get(this.jobKey(job));
    if (status === 'done' || status === 'failed') {
      await store.lRem(PROCESSING, 1, raw);
      return true;
    }
    const delay = job.notBefore - Date.now();
    if (delay > 0) {
      await this.requeue(store, raw, raw);
      this.schedule(delay);
      return false;
    }
    const lockKey = `inventory:deduction:lock:${job.restaurantId}:${job.orderId}`;
    const token = randomUUID();
    const locked = await store.set(lockKey, token, { NX: true, EX: this.options.lockSeconds });
    if (locked !== 'OK') {
      await this.requeue(store, raw, raw);
      this.schedule(this.options.baseDelayMs);
      return false;
    }
    try {
      await this.handler(job);
      await store.set(this.jobKey(job), 'done', { EX: 30 * 24 * 60 * 60 });
      await store.lRem(PROCESSING, 1, raw);
    } catch (error) {
      const attempts = job.attempts + 1;
      this.logFailure('inventory.deduction', error, attempts);
      if (attempts >= this.options.maxAttempts) {
        await store.set(this.jobKey(job), 'failed', { EX: 7 * 24 * 60 * 60 });
        await store.rPush(DEAD, JSON.stringify({ ...job, attempts }));
        await store.lRem(PROCESSING, 1, raw);
        await this.auditTerminalFailure(job, error);
      } else {
        const retryDelay = this.backoff(attempts);
        const retry = { ...job, attempts, notBefore: Date.now() + retryDelay };
        await this.requeue(store, raw, JSON.stringify(retry));
        this.schedule(retryDelay);
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

  private logFailure(stage: string, error: unknown, attempt?: number): void {
    console.error('[DeductionQueue] Failure', {
      stage,
      ...safeError(error),
      ...(attempt ? { attempt } : {}),
    });
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
