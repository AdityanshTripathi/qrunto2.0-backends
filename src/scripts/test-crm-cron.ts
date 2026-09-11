import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { CRMScheduler, shouldStartLocalScheduler } from '../services/crm/scheduler.service';
import { CampaignService } from '../services/crm/campaign.service';
import { SegmentService } from '../services/crm/segment.service';
import { OccasionService } from '../services/crm/occasion.service';
import { prisma, pool } from '../lib/prisma';
import { sharedRedis } from '../lib/redis';
import { StageError } from '../lib/safe-error';
import { DeductionQueueService } from '../services/inventory/deduction-queue.service';

// Only mocked CRM data: no campaign messages or database writes.
export async function main() {
  process.env.VERCEL = '1';
  delete process.env.REDIS_URL;
  delete process.env.SOCKET_REDIS_URL;
  process.env.CRON_SECRET = 'test-only-cron-secret';
  assert.equal(shouldStartLocalScheduler({}), false);
  assert.equal(shouldStartLocalScheduler({ ENABLE_LOCAL_CRM_SCHEDULER: 'true' }), true);
  assert.equal(shouldStartLocalScheduler({ VERCEL: '1', ENABLE_LOCAL_CRM_SCHEDULER: 'true' }), false);
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(config.crons, undefined, 'External scheduler replaces Vercel Cron on Hobby');
  assert.equal(config.functions['api/index.ts'].maxDuration, 300);
  assert.equal(config.rewrites[0].destination, '/api/index.ts');

  const values = new Map<string, string>();
  const lists = new Map<string, string[]>();
  function store() {
    return {
      isReady: true, isOpen: true,
      on() {}, async connect() {}, destroy() {},
      async get(key: string) { return values.get(key) ?? null; },
      async incr(key: string) {
        const value = Number(values.get(key) || 0) + 1;
        values.set(key, String(value));
        return value;
      },
      async expire() { return true; },
      async del(keys: string | string[]) {
        const all = Array.isArray(keys) ? keys : [keys];
        all.forEach(key => values.delete(key));
        return all.length;
      },
      async rPush(key: string, value: string) {
        const list = lists.get(key) ?? [];
        lists.set(key, list);
        return list.push(value);
      },
      async lLen(key: string) { return lists.get(key)?.length ?? 0; },
      async set(key: string, value: string, options: { NX?: boolean }) {
        if (options.NX && values.has(key)) return null;
        values.set(key, value);
        return 'OK';
      },
      async eval(script: string, options: { keys: string[]; arguments: string[] }) {
        if (script.includes('crm-dead-letter')) {
          values.set(options.keys[0]!, 'failed');
          const list = lists.get(options.keys[1]!) ?? [];
          lists.set(options.keys[1]!, list);
          list.push(options.arguments[1]!);
          values.delete(options.keys[2]!);
          values.delete(options.keys[3]!);
          return 1;
        }
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
  prisma.campaign.updateMany = (async () => ({ count: 0 })) as typeof prisma.campaign.updateMany;
  prisma.campaign.findMany = (async () => [{ id: 'test-campaign', brandId: 'test-brand' }]) as typeof prisma.campaign.findMany;
  SegmentService.prototype.evaluateAllSegmentsForBrand = (async () => {
    segments++;
    return { processed: 1, failed: 0 };
  }) as typeof SegmentService.prototype.evaluateAllSegmentsForBrand;
  CampaignService.prototype.sendCampaign = async () => { campaigns++; dispatchStarted!(); await pending; return true; };
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
  const failedBucket = Math.floor(Date.parse('2026-09-06T00:01:00Z') / 60000);
  const failedPrefix = `crm:scheduler:campaigns:${failedBucket}`;
  const attemptsKey = 'crm:scheduler:campaigns:attempts';
  const retryAtKey = 'crm:scheduler:campaigns:retry-at';
  assert.equal(values.has(failedPrefix), false);
  assert.equal(values.get(attemptsKey), '1');
  assert.equal(await CRMScheduler.runCycle(new Date('2026-09-06T00:01:00Z'), store()), 'skipped');
  values.delete(retryAtKey);
  await assert.rejects(CRMScheduler.runCycle(new Date('2026-09-06T00:01:00Z'), store()));
  assert.equal(values.get(attemptsKey), '2');
  values.delete(retryAtKey);
  await assert.rejects(CRMScheduler.runCycle(new Date('2026-09-06T00:01:00Z'), store()));
  assert.equal(values.has(attemptsKey), false);
  assert.equal(lists.get('crm:scheduler:dead')?.length, 1);
  assert.equal(values.get(`${failedPrefix}:failed`), 'failed');
  const monitored = await CRMScheduler.getStatus(store());
  assert.equal(monitored.deadLetter, 1);
  assert.equal(monitored.failures, 3);
  assert.equal(monitored.retries, 2);

  values.clear();
  lists.clear();
  CampaignService.prototype.sendCampaign = async () => {
    throw Object.assign(new Error('private permanent detail'), { code: 'P2021' });
  };
  await assert.rejects(CRMScheduler.runCycle(new Date('2026-09-07T00:01:00Z'), store()));
  assert.equal(lists.get('crm:scheduler:dead')?.length, 1);
  assert.equal(values.has('crm:scheduler:campaigns:attempts'), false);
  CampaignService.prototype.sendCampaign = async () => true;

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
  CampaignService.prototype.sendCampaign = async () => true;
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
  CRMScheduler.getStatus = async () => ({
    running: false, success: 3, failures: 1, retries: 1, deadLetter: 0,
  });
  DeductionQueueService.getStatus = async () => ({
    ready: 1, processing: 0, deadLetter: 0, success: 2, failures: 1, retries: 1,
  });
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
    const statusUrl = `${url}/status`;
    assert.equal((await fetch(statusUrl)).status, 401);
    const statusResponse = await fetch(statusUrl, { headers });
    assert.equal(statusResponse.status, 200);
    const jobStatus = await statusResponse.json() as any;
    assert.equal(jobStatus.crm.success, 3);
    assert.equal(jobStatus.inventory.ready, 1);
    const authorized = await fetch(url, { headers });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), { status: 'completed' });
    assert.equal(cycles, 1);
    process.env.CRON_SECRET = 'test-only-rotated-cron-secret';
    assert.equal((await fetch(url, { headers })).status, 401, 'Old forwarded secret is rejected after rotation');
    assert.equal((await fetch(statusUrl, { headers })).status, 401);
    const rotatedHeaders = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
    assert.equal((await fetch(url, { headers: rotatedHeaders })).status, 200);
    assert.equal((await fetch(statusUrl, { headers: rotatedHeaders })).status, 200);
    assert.equal(cycles, 2);
    process.env.CRON_SECRET = 'test-only-cron-secret';
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

if (require.main === module) main().catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
