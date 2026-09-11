'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prisma, violations } = require('./support/isolation.cjs');
const { CampaignService } = require('../dist/services/crm/campaign.service');

after(() => assert.equal(violations.length, 0));

function harness(t, { status = 'QUEUED', campaignAttempts = 0, recipients = [] } = {}) {
  const now = new Date();
  const campaign = {
    id: 'campaign-1', brandId: 'brand-1', segmentId: null, status,
    attemptCount: campaignAttempts, scheduledAt: new Date(now.getTime() - 1000), updatedAt: now,
  };
  const customers = [{ id: 'sent-customer' }, { id: 'retry-customer' }];
  const logs = new Map(recipients.map(row => [row.customerId, { campaignId: campaign.id, ...row }]));

  void prisma.campaign.updateMany; void prisma.campaign.findMany; void prisma.campaign.findFirst;
  void prisma.customer.findMany; void prisma.campaignLog.createMany;
  void prisma.campaignLog.findMany; void prisma.campaignLog.updateMany;

  t.mock.method(prisma.campaign, 'updateMany', async ({ where, data }) => {
    if (where.id && (where.id !== campaign.id || where.brandId !== campaign.brandId)) return { count: 0 };
    if (where.status?.in && !where.status.in.includes(campaign.status)) return { count: 0 };
    if (typeof where.status === 'string' && where.status !== campaign.status) return { count: 0 };
    if (where.attemptCount?.lt !== undefined && campaign.attemptCount >= where.attemptCount.lt) return { count: 0 };
    if (where.updatedAt?.lte && campaign.updatedAt > where.updatedAt.lte) return { count: 0 };
    if (data.attemptCount?.increment) campaign.attemptCount += data.attemptCount.increment;
    for (const key of ['status', 'sentCount', 'failedCount']) if (data[key] !== undefined) campaign[key] = data[key];
    campaign.updatedAt = new Date();
    return { count: 1 };
  });
  t.mock.method(prisma.campaign, 'findMany', async ({ where }) => {
    assert.deepEqual(where.status.in, ['QUEUED', 'FAILED']);
    return where.status.in.includes(campaign.status) && campaign.attemptCount < where.attemptCount.lt
      && campaign.scheduledAt <= where.scheduledAt.lte ? [{ ...campaign }] : [];
  });
  t.mock.method(prisma.campaign, 'findFirst', async ({ where }) =>
    where.id === campaign.id && where.brandId === campaign.brandId && (!where.status || where.status === campaign.status)
      ? { ...campaign } : null);
  t.mock.method(prisma.customer, 'findMany', async ({ where }) => {
    assert.deepEqual(where, { brandId: campaign.brandId }); return customers;
  });
  t.mock.method(prisma.campaignLog, 'createMany', async ({ data, skipDuplicates }) => {
    assert.equal(skipDuplicates, true); let count = 0;
    for (const row of data) if (!logs.has(row.customerId)) {
      logs.set(row.customerId, { ...row, attemptCount: 0, errorDetails: null, lastAttemptAt: null }); count++;
    }
    return { count };
  });
  t.mock.method(prisma.campaignLog, 'findMany', async ({ where }) => [...logs.values()]
    .filter(row => row.campaignId === where.campaignId && where.customerId.in.includes(row.customerId))
    .map(row => ({ customerId: row.customerId, status: row.status, attemptCount: row.attemptCount })));
  t.mock.method(prisma.campaignLog, 'updateMany', async ({ where, data }) => {
    const row = logs.get(where.customerId);
    if (!row || row.campaignId !== where.campaignId) return { count: 0 };
    if (where.status?.in && !where.status.in.includes(row.status)) return { count: 0 };
    if (typeof where.status === 'string' && where.status !== row.status) return { count: 0 };
    if (where.attemptCount !== undefined && row.attemptCount !== where.attemptCount) return { count: 0 };
    if (data.attemptCount?.increment) row.attemptCount += data.attemptCount.increment;
    for (const key of ['status', 'errorDetails', 'lastAttemptAt']) if (data[key] !== undefined) row[key] = data[key];
    return { count: 1 };
  });
  return { campaign, logs };
}

test('Campaign retry: completed campaign and SENT recipient are never dispatched twice', async t => {
  const state = harness(t, { recipients: [{ customerId: 'sent-customer', status: 'SENT', attemptCount: 1 }] });
  const delivered = [];
  t.mock.method(CampaignService.prototype, 'deliverRecipient', async input => delivered.push(input));
  const service = new CampaignService();
  assert.deepEqual(await service.processQueuedCampaigns(), { processed: 1, failed: 0 });
  assert.equal(state.campaign.status, 'COMPLETED');
  assert.deepEqual(delivered.map(row => row.customerId), ['retry-customer']);
  assert.equal(state.logs.get('sent-customer').attemptCount, 1);
  assert.equal(state.logs.size, 2);
  assert.deepEqual(await service.processQueuedCampaigns(), { processed: 0, failed: 0 });
  assert.equal(delivered.length, 1); assert.equal(state.logs.size, 2);
});

test('Campaign retry: only FAILED/PENDING recipients retry with stable idempotency keys', async t => {
  const state = harness(t, { status: 'FAILED', campaignAttempts: 1, recipients: [
    { customerId: 'sent-customer', status: 'SENT', attemptCount: 1 },
    { customerId: 'retry-customer', status: 'FAILED', attemptCount: 1 },
  ] });
  const delivered = [];
  t.mock.method(CampaignService.prototype, 'deliverRecipient', async input => delivered.push(input));
  assert.deepEqual(await new CampaignService().processQueuedCampaigns(), { processed: 1, failed: 0 });
  assert.equal(state.campaign.attemptCount, 2); assert.equal(state.campaign.status, 'COMPLETED');
  assert.equal(state.logs.get('sent-customer').attemptCount, 1);
  assert.equal(state.logs.get('retry-customer').attemptCount, 2);
  assert.equal(state.logs.get('retry-customer').status, 'SENT');
  assert.deepEqual(delivered, [{
    idempotencyKey: 'campaign:campaign-1:customer:retry-customer',
    campaignId: 'campaign-1', customerId: 'retry-customer', brandId: 'brand-1',
  }]);
  assert.equal(state.logs.size, 2);
});

test('Campaign retry: campaign and recipient attempts stop permanently at the bound', async t => {
  const state = harness(t);
  let deliveries = 0;
  t.mock.method(CampaignService.prototype, 'deliverRecipient', async () => { deliveries++; throw new Error('test failure'); });
  const service = new CampaignService();
  for (let attempt = 1; attempt <= 3; attempt++) {
    await assert.rejects(service.processQueuedCampaigns(), error => error.code === 'CRM_PARTIAL_FAILURE');
    assert.equal(state.campaign.attemptCount, attempt); assert.equal(state.campaign.status, 'FAILED');
  }
  assert.deepEqual(await service.processQueuedCampaigns(), { processed: 0, failed: 0 });
  assert.equal(deliveries, 6); assert.equal(state.logs.size, 2);
  assert.ok([...state.logs.values()].every(row => row.attemptCount === 3 && row.status === 'FAILED'));
});

test('Campaign retry schema enforces one log per campaign recipient', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20260912000000_campaign_retry_idempotency/migration.sql'), 'utf8');
  assert.match(schema, /@@unique\(\[campaignId, customerId\]\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "campaign_logs_campaign_id_customer_id_key"/);
  assert.doesNotMatch(migration, /DELETE\s+FROM/i);
});
