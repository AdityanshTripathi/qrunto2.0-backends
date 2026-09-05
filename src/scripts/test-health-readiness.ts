import 'dotenv/config';
import assert from 'node:assert/strict';
import { checkReadiness } from '../services/health.service';
import { logSafeError } from '../lib/safe-error';

const passes = async () => undefined;
const fails = async () => { throw new Error('secret=do-not-log'); };

async function readinessTests(): Promise<void> {
  const healthy = await checkReadiness({ database: passes, redis: passes });
  assert.deepEqual(healthy, {
    status: 'healthy', dependencies: { database: 'healthy', redis: 'healthy' },
  });

  const databaseDown = await checkReadiness({ database: fails, redis: passes });
  assert.equal(databaseDown.status, 'unready');
  assert.deepEqual(databaseDown.dependencies, { database: 'unhealthy', redis: 'healthy' });

  const redisDown = await checkReadiness({ database: passes, redis: fails });
  assert.equal(redisDown.status, 'degraded');
  assert.deepEqual(redisDown.dependencies, { database: 'healthy', redis: 'unhealthy' });

  const hangs = () => new Promise<never>(() => undefined);
  const timedOut = await checkReadiness({ database: hangs, redis: passes }, 5);
  assert.equal(timedOut.status, 'unready');
}

function loggingTest(): void {
  const original = console.error;
  const entries: unknown[] = [];
  console.error = (...args: unknown[]) => { entries.push(args); };
  try {
    logSafeError('connection', new Error('redis://user:password@host token=secret'), 'redis');
  } finally {
    console.error = original;
  }
  const output = JSON.stringify(entries);
  assert.equal(output.includes('password'), false);
  assert.equal(output.includes('token=secret'), false);
  const entry = (entries[0] as unknown[])[0] as { service?: string };
  assert.equal(entry.service, 'redis');
}

async function livenessTest(): Promise<void> {
  process.env.VERCEL = '1';
  const { server } = await import('../server');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'alive' });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function main(): Promise<void> {
  await readinessTests();
  loggingTest();
  await livenessTest();
  console.log('Health, readiness, and structured logging tests passed');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Health test failed');
  process.exitCode = 1;
});
