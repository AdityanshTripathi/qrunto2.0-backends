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
  t.mock.timers.enable({ apis: ['Date'], now });
  void prisma.brand.findMany; void prisma.campaign.findMany;
  t.mock.method(prisma.brand, 'findMany', async () => [{ id: 'fixture-brand' }]);
  t.mock.method(prisma.campaign, 'findMany', async () => [{ id: 'fixture-campaign', brandId: 'fixture-brand' }]);
  t.mock.method(SegmentService.prototype, 'evaluateAllSegmentsForBrand', async () => {});
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
  assert.equal(await store.get('crm:scheduler:lock'), null);
  assert.equal(await store.get('crm:scheduler:campaigns:attempts'), null);
  await CRMScheduler.runCycle(now, store); assert.equal(attempts, 3);
});
