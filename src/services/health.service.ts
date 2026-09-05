import { pool } from '../lib/prisma';
import { sharedRedis } from '../lib/redis';

export type DependencyStatus = 'healthy' | 'unhealthy';
export interface ReadinessResult {
  status: 'healthy' | 'degraded' | 'unready';
  dependencies: { database: DependencyStatus; redis: DependencyStatus };
}
export interface ReadinessChecks {
  database: () => Promise<unknown>;
  redis: () => Promise<unknown>;
}

let databaseProbe: Promise<unknown> | undefined;
let redisProbe: Promise<unknown> | undefined;

const checks: ReadinessChecks = {
  database: () => databaseProbe ??= pool.query('SELECT 1').finally(() => { databaseProbe = undefined; }),
  redis: () => redisProbe ??= sharedRedis.commands().then(client => client.ping()).finally(() => { redisProbe = undefined; }),
};

async function probe(check: () => Promise<unknown>, timeoutMs: number): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness timeout')), timeoutMs);
      }),
    ]);
    return 'healthy';
  } catch {
    return 'unhealthy';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkReadiness(
  dependencyChecks: ReadinessChecks = checks,
  timeoutMs = 1_500,
): Promise<ReadinessResult> {
  const [database, redis] = await Promise.all([
    probe(dependencyChecks.database, timeoutMs),
    probe(dependencyChecks.redis, timeoutMs),
  ]);
  const status = database === 'unhealthy' ? 'unready'
    : redis === 'unhealthy' ? 'degraded' : 'healthy';
  return { status, dependencies: { database, redis } };
}
