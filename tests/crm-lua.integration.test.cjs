'use strict';
const { prisma, violations } = require('./support/isolation.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { LuaStore } = require('./support/lua-store.cjs');
const { CRMScheduler } = require('../dist/services/crm/scheduler.service');
const { CampaignService } = require('../dist/services/crm/campaign.service');
const { SegmentService } = require('../dist/services/crm/segment.service');
const { OccasionService } = require('../dist/services/crm/occasion.service');
after(() => assert.equal(violations.length, 0));

test('CRM: actual Lua dead-letter writes failure state after bounded exponential retries', async t => {
  const now = new Date('2026-09-05T00:00:00Z');
  const { sanitizeRequestId } = require('../dist/lib/request-context');
  const logs = []; t.mock.method(console, 'error', row => logs.push(row));
  t.mock.timers.enable({ apis: ['Date'], now });
  void prisma.brand.findMany; void prisma.campaign.findMany; void prisma.campaign.updateMany;
  t.mock.method(prisma.brand, 'findMany', async () => [{ id: 'fixture-brand' }]);
  t.mock.method(prisma.campaign, 'updateMany', async () => ({ count: 0 }));
  t.mock.method(prisma.campaign, 'findMany', async () => [{ id: 'fixture-campaign', brandId: 'fixture-brand' }]);
  t.mock.method(SegmentService.prototype, 'evaluateAllSegmentsForBrand', async () => ({ processed: 1, failed: 0 }));
  t.mock.method(OccasionService.prototype, 'checkAndSendOccasionMessages', async () => []);
  let attempts = 0;
  t.mock.method(CampaignService.prototype, 'sendCampaign', async () => { attempts++; throw new Error('synthetic campaign failure'); });
  const store = new LuaStore();
  for (const delay of [1000, 2000]) {
    await assert.rejects(CRMScheduler.runCycle(now, store));
    assert.equal(Number(await store.get('crm:scheduler:campaigns:retry-at')) - Date.now(), delay);
    const before = attempts;
    t.mock.timers.tick(delay - 1); await CRMScheduler.runCycle(now, store); assert.equal(attempts, before);
    t.mock.timers.tick(1);
  }
  await assert.rejects(CRMScheduler.runCycle(now, store));
  assert.equal(attempts, 3);
  const status = await CRMScheduler.getStatus(store);
  assert.equal(status.deadLetter, 1); assert.equal(status.failures, 3); assert.equal(status.retries, 2);
  const dead = JSON.parse(store.lists.get('crm:scheduler:dead')[0]);
  assert.ok(sanitizeRequestId(dead.requestId));
  const failures = logs.filter(row => /jobs\.campaigns\.(retry|dead-letter)/.test(row.stage));
  assert.equal(failures.length, 3);
  assert.ok(failures.every(row => sanitizeRequestId(row.requestId)));
  assert.equal(failures[2].requestId, dead.requestId);
  assert.equal(await store.get('crm:scheduler:lock'), null);
  assert.equal(await store.get('crm:scheduler:campaigns:attempts'), null);
  await CRMScheduler.runCycle(now, store); assert.equal(attempts, 3);
});

test('CRM: one brand failure does not stop later brands and prevents a false success checkpoint', async t => {
  const now = new Date('2026-09-05T00:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  void prisma.brand.findMany; void prisma.campaign.findMany; void prisma.campaign.updateMany;
  t.mock.method(prisma.brand, 'findMany', async () => [{ id: 'failing-brand' }, { id: 'healthy-brand' }]);
  t.mock.method(prisma.campaign, 'updateMany', async () => ({ count: 0 }));
  t.mock.method(prisma.campaign, 'findMany', async () => []);
  const evaluated = [];
  t.mock.method(SegmentService.prototype, 'evaluateAllSegmentsForBrand', async brandId => {
    evaluated.push(brandId);
    return brandId === 'failing-brand' ? { processed: 2, failed: 1 } : { processed: 2, failed: 0 };
  });
  t.mock.method(OccasionService.prototype, 'checkAndSendOccasionMessages', async () => []);
  const store = new LuaStore();
  await assert.rejects(CRMScheduler.runCycle(now, store), error => error.code === 'CRM_PARTIAL_FAILURE');
  assert.deepEqual(evaluated, ['failing-brand', 'healthy-brand']);
  const bucket = Math.floor(now.getTime() / (4 * 60 * 60 * 1000));
  assert.equal(await store.get(`crm:scheduler:segments:${bucket}`), null);
  const status = await CRMScheduler.getStatus(store);
  assert.equal(status.failures, 1); assert.equal(status.retries, 1);
});

test('CRM: one campaign failure does not stop later campaigns and is reported for retry', async t => {
  const now = new Date('2026-09-05T00:00:00Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  void prisma.brand.findMany; void prisma.campaign.findMany; void prisma.campaign.updateMany;
  t.mock.method(prisma.brand, 'findMany', async () => []);
  t.mock.method(prisma.campaign, 'updateMany', async () => ({ count: 0 }));
  t.mock.method(prisma.campaign, 'findMany', async () => [
    { id: 'failed-campaign', brandId: 'brand-a' }, { id: 'healthy-campaign', brandId: 'brand-b' },
  ]);
  const processed = [];
  t.mock.method(CampaignService.prototype, 'sendCampaign', async campaignId => {
    processed.push(campaignId); return campaignId !== 'failed-campaign';
  });
  t.mock.method(OccasionService.prototype, 'checkAndSendOccasionMessages', async () => []);
  const store = new LuaStore();
  await assert.rejects(CRMScheduler.runCycle(now, store), error => error.code === 'CRM_PARTIAL_FAILURE');
  assert.deepEqual(processed, ['failed-campaign', 'healthy-campaign']);
  const bucket = Math.floor(now.getTime() / 60000);
  assert.equal(await store.get(`crm:scheduler:campaigns:${bucket}`), null);
});
