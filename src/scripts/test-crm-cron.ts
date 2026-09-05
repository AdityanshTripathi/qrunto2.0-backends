import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { CRMScheduler } from '../services/crm/scheduler.service';
import { CampaignService } from '../services/crm/campaign.service';
import { SegmentService } from '../services/crm/segment.service';
import { OccasionService } from '../services/crm/occasion.service';
import { prisma, pool } from '../lib/prisma';
import { sharedRedis } from '../lib/redis';
import { StageError } from '../lib/safe-error';

// Only mocked CRM data: no campaign messages or database writes.
async function main() {
  process.env.VERCEL = '1';
  delete process.env.REDIS_URL;
  delete process.env.SOCKET_REDIS_URL;
  process.env.CRON_SECRET = 'test-only-cron-secret';
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(config.crons, undefined, 'External scheduler replaces Vercel Cron on Hobby');
  assert.equal(config.functions['api/index.ts'].maxDuration, 300);
  assert.equal(config.rewrites[0].destination, '/api/index.ts');

  const values = new Map<string, string>();
  function store() {
    return {
      isReady: true, isOpen: true,
      on() {}, async connect() {}, destroy() {},
      async get(key: string) { return values.get(key) ?? null; },
      async set(key: string, value: string, options: { NX?: boolean }) {
        if (options.NX && values.has(key)) return null;
        values.set(key, value);
        return 'OK';
      },
      async eval(_script: string, options: { keys: string[]; arguments: string[] }) {
        const key = options.keys[0]!;
        if (values.get(key) === options.arguments[0]) values.delete(key);
      },
    } as unknown as NonNullable<Parameters<typeof CRMScheduler.runCycle>[1]>;
  }
  let segments = 0, campaigns = 0, occasions = 0;
  let finishDispatch: (() => void) | undefined;
  let dispatchStarted: (() => void) | undefined;
  const started = new Promise<void>(resolve => { dispatchStarted = resolve; });
  const pending = new Promise<void>(resolve => { finishDispatch = resolve; });
  prisma.brand.findMany = (async () => [{ id: 'test-brand', name: 'Test' }]) as typeof prisma.brand.findMany;
  prisma.campaign.findMany = (async () => [{ id: 'test-campaign', brandId: 'test-brand' }]) as typeof prisma.campaign.findMany;
  SegmentService.prototype.evaluateAllSegmentsForBrand = (async () => { segments++; }) as typeof SegmentService.prototype.evaluateAllSegmentsForBrand;
  CampaignService.prototype.sendCampaign = async () => { campaigns++; dispatchStarted!(); await pending; };
  OccasionService.prototype.checkAndSendOccasionMessages = async () => { occasions++; return []; };
  const now = new Date('2026-09-05T00:00:00Z');
  const originalCommands = sharedRedis.commands;
  let sharedCalls = 0;
  sharedRedis.commands = async () => { sharedCalls++; return store(); };
  const running = CRMScheduler.runCycle(now);
  await started;
  assert.equal(await CRMScheduler.runCycle(now, store()), 'skipped');
  assert.equal(occasions, 0, 'Cycle must await campaign dispatch');
  finishDispatch!();
  assert.equal(await running, 'completed');
  assert.equal(sharedCalls, 1, 'Cron must acquire the shared command client');
  sharedRedis.commands = originalCommands;
  assert.equal(await CRMScheduler.runCycle(now, store()), 'skipped');
  assert.deepEqual([segments, campaigns, occasions], [1, 1, 1]);
  await CRMScheduler.runCycle(new Date('2026-09-05T00:01:00Z'), store());
  assert.deepEqual([segments, campaigns, occasions], [1, 2, 1]);
  await CRMScheduler.runCycle(new Date('2026-09-05T04:00:00Z'), store());
  assert.deepEqual([segments, campaigns, occasions], [2, 3, 1]);
  await CRMScheduler.runCycle(new Date('2026-09-06T00:00:00Z'), store());
  assert.deepEqual([segments, campaigns, occasions], [3, 4, 2]);
  CampaignService.prototype.sendCampaign = async () => { throw new Error('internal-test-detail'); };
  await assert.rejects(CRMScheduler.runCycle(new Date('2026-09-06T00:01:00Z'), store()));
  assert.equal(values.has('crm:scheduler:lock'), false, 'Failure must release lock');
  assert.equal(values.has(`crm:scheduler:campaigns:${Math.floor(Date.parse('2026-09-06T00:01:00Z') / 60000)}`), false);

  const fault = Object.assign(new Error('rediss://user:private-password@host CRON_SECRET=private-token'), { code: 'ECONNRESET' });
  const checkStage = (stage: string) => (error: unknown) => {
    assert.ok(error instanceof StageError);
    assert.equal(error.stage, stage);
    assert.equal(error.code, 'ECONNRESET');
    assert.equal(error.message, 'Connection reset');
    return true;
  };
  sharedRedis.commands = async () => { throw fault; };
  await assert.rejects(CRMScheduler.runCycle(now), checkStage('redis.connect'));
  sharedRedis.commands = originalCommands;
  CampaignService.prototype.sendCampaign = async () => {};
  for (const [method, stage] of [['set', 'redis.lock.acquire'], ['get', 'redis.segments.checkpoint.read'], ['eval', 'redis.lock.release']] as const) {
    values.clear();
    const broken = store();
    (broken as any)[method] = async () => { throw fault; };
    await assert.rejects(CRMScheduler.runCycle(now, broken), checkStage(stage));
  }
  values.clear();
  const checkpointFailure = store();
  const set = checkpointFailure.set.bind(checkpointFailure);
  (checkpointFailure as any).set = async (...args: any[]) => {
    if (!args[2]?.NX) throw fault;
    return (set as any)(...args);
  };
  await assert.rejects(CRMScheduler.runCycle(now, checkpointFailure), checkStage('redis.segments.checkpoint.write'));
  values.clear();
  CampaignService.prototype.sendCampaign = async () => { throw fault; };
  const cleanupFailure = store();
  (cleanupFailure as any).eval = async () => { throw new Error('private-cleanup-error'); };
  await assert.rejects(CRMScheduler.runCycle(now, cleanupFailure), checkStage('jobs.campaigns'));

  const originalStart = CRMScheduler.start;
  let starts = 0;
  CRMScheduler.start = () => { starts++; };
  const { server, io } = await import('../server');
  assert.equal(starts, 0, 'Vercel entry must not start the scheduler');
  CRMScheduler.start = originalStart;
  const originalInterval = global.setInterval;
  let intervals = 0;
  global.setInterval = ((...args: Parameters<typeof setInterval>) => {
    intervals++;
    return originalInterval(...args);
  }) as typeof setInterval;
  CRMScheduler.start();
  global.setInterval = originalInterval;
  assert.equal(intervals, 0, 'Vercel must not start background intervals');
  assert.equal(server.listening, false);
  let cycles = 0;
  CRMScheduler.runCycle = async () => { cycles++; return 'completed'; };
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const url = `${base}/api/internal/cron/crm`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal(cycles, 0);
    const headers = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
    const authorized = await fetch(url, { headers });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), { status: 'completed' });
    assert.equal(cycles, 1);
    CRMScheduler.runCycle = async () => { throw new Error('internal-test-detail'); };
    const failed = await fetch(url, { headers });
    assert.equal(failed.status, 500);
    assert.equal((await failed.text()).includes('internal-test-detail'), false);
    delete process.env.CRON_SECRET;
    assert.equal((await fetch(url, { headers })).status, 503);
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/crm/customers`)).status, 401);
    console.log('PASS: auth, single cycle, awaited dispatch, cross-instance overlap/replay, cadences, failure cleanup, Vercel startup, existing routes, vercel.json');
  } finally {
    await new Promise<void>(resolve => io.close(() => resolve()));
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
