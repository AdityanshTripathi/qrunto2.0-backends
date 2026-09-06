// Bounded per-process counters, with no request IDs, URLs or payloads retained.
export const WINDOW_MS = 300_000;
export const SLOW_MS = 2_000;
type Counters = { requests: number; errors5xx: number; slow: number; durationMs: number;
  redisFailures: number; crmFailures: number; inventoryFailures: number; fatal: number };
const empty = (): Counters => ({ requests: 0, errors5xx: 0, slow: 0, durationMs: 0,
  redisFailures: 0, crmFailures: 0, inventoryFailures: 0, fatal: 0 });

export class MonitoringMetrics {
  private buckets = new Map<number, Counters>();
  private prune(now: number): void {
    for (const key of this.buckets.keys()) if (key <= now - WINDOW_MS || key > now) this.buckets.delete(key);
  }
  private bucket(now: number): Counters {
    this.prune(now);
    const key = Math.floor(now / 10_000) * 10_000;
    let value = this.buckets.get(key);
    if (!value) { value = empty(); this.buckets.set(key, value); }
    return value;
  }
  request(status: number, duration: number, now = Date.now()): void {
    if (!Number.isFinite(duration) || duration < 0) return;
    const bucket = this.bucket(now);
    bucket.requests++; bucket.errors5xx += Number(status >= 500);
    bucket.slow += Number(duration >= SLOW_MS); bucket.durationMs += duration;
  }
  failure(service: string, stage: string, now = Date.now()): void {
    // Count terminal/retry events once, not their enclosing cron error as well.
    const key = service === 'redis' ? 'redisFailures'
      : service === 'crm' && /^jobs\.[a-z]+\.(retry|dead-letter)$/.test(stage) ? 'crmFailures'
      : service === 'inventory' && /^(inventory\.deduction\.(retry|dead-letter)|deduction\.local)$/.test(stage) ? 'inventoryFailures'
      : service === 'process' ? 'fatal' : undefined;
    if (key) this.bucket(now)[key]++;
  }
  snapshot(now = Date.now()): Counters & { windowSeconds: number; scope: string } {
    this.prune(now);
    const total = empty();
    for (const value of this.buckets.values()) for (const key of Object.keys(total) as (keyof Counters)[]) total[key] += value[key];
    return { ...total, windowSeconds: WINDOW_MS / 1000, scope: 'process-local' };
  }
}
export const monitoringMetrics = new MonitoringMetrics();
