'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prisma, violations } = require('./support/isolation.cjs');
const { CustomerController } = require('../dist/controllers/crm/customer.controller');
const { AuthController } = require('../dist/controllers/auth.controller');
const { CampaignController } = require('../dist/controllers/crm/campaign.controller');
const { CampaignService } = require('../dist/services/crm/campaign.service');
const { DeductionQueueService } = require('../dist/services/inventory/deduction-queue.service');
const { appBaseUrl } = require('../dist/services/table.service');
const { SuperAdminController } = require('../dist/controllers/superadmin.controller');

after(() => assert.equal(violations.length, 0));

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('P3: customer pagination is bounded, deterministic, and list/count run concurrently', async () => {
  prisma.user.findUnique = async () => ({ restaurants: [{ brandId: 'brand-1' }] });
  let listStarted = false;
  let countStarted = false;
  prisma.customer.findMany = async query => {
    listStarted = true;
    await Promise.resolve();
    assert.equal(countStarted, true, 'count query should start without awaiting the list');
    assert.equal(query.take, 100);
    assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    return [];
  };
  prisma.customer.count = async query => {
    countStarted = true;
    assert.equal(listStarted, true);
    assert.equal(query.where.brandId, 'brand-1');
    return 0;
  };

  const res = response();
  await new CustomerController().getCustomers({
    user: { id: 'user-1' }, query: { limit: '999', offset: '0' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { customers: [], total: 0 });

  const invalid = response();
  await new CustomerController().getCustomers({
    user: { id: 'user-1' }, query: { limit: '-1' },
  }, invalid);
  assert.equal(invalid.statusCode, 400);
});

test('P3: campaign and recipient lists use bounded duplicate-free cursor pages', async () => {
  const campaigns = [
    { id: '00000000-0000-4000-8000-000000000003' },
    { id: '00000000-0000-4000-8000-000000000002' },
    { id: '00000000-0000-4000-8000-000000000001' },
  ];
  prisma.campaign.findMany = async query => {
    assert.equal(query.where.brandId, 'brand-1');
    assert.equal(query.take, 3);
    assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    return campaigns;
  };
  const service = new CampaignService();
  assert.deepEqual(await service.getCampaigns('brand-1', { limit: 2 }), {
    campaigns: campaigns.slice(0, 2),
    pagination: { limit: 2, nextCursor: campaigns[1].id, hasMore: true },
  });

  prisma.campaign.findFirst = async query => query.where.brandId === 'brand-1' ? { id: 'campaign-1' } : null;
  prisma.campaignLog.findMany = async query => {
    assert.equal(query.where.campaignId, 'campaign-1');
    assert.deepEqual(query.cursor, { id: campaigns[1].id });
    assert.equal(query.skip, 1);
    assert.equal(query.take, 2);
    return campaigns.slice(1);
  };
  assert.deepEqual(await service.getCampaignLogs('campaign-1', 'brand-1', {
    cursor: campaigns[1].id, limit: 1,
  }), {
    logs: [campaigns[1]],
    pagination: { limit: 1, nextCursor: campaigns[1].id, hasMore: true },
  });
});

test('P3: campaign statistics aggregate in PostgreSQL instead of loading every campaign', async () => {
  prisma.user.findUnique = async () => ({ restaurants: [{ brandId: 'brand-1' }] });
  prisma.campaign.findMany = async () => assert.fail('campaign stats must not load raw campaigns');
  prisma.campaign.groupBy = async query => {
    assert.deepEqual(query.by, ['channel', 'status']);
    assert.deepEqual(query.where, { brandId: 'brand-1' });
    return [
      { channel: 'SMS', status: 'COMPLETED', _count: { _all: 3 }, _sum: { sentCount: 20, failedCount: 0 } },
      { channel: 'EMAIL', status: 'FAILED', _count: { _all: 1 }, _sum: { sentCount: 4, failedCount: 2 } },
      { channel: 'PUSH', status: 'QUEUED', _count: { _all: 2 }, _sum: { sentCount: null, failedCount: null } },
    ];
  };
  const res = response();
  await new CampaignController().getCampaignStats({ user: { id: 'user-1' }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totalCampaigns: 6, totalSent: 24, totalFailed: 2,
    emailCount: 1, smsCount: 3, completedCount: 3, pendingCount: 2,
  });
});

test('P3: superadmin transaction history is a bounded deterministic cursor page', async () => {
  const records = [
    { id: '00000000-0000-4000-8000-000000000003', restaurant: { name: 'A' }, order: null },
    { id: '00000000-0000-4000-8000-000000000002', restaurant: { name: 'B' }, order: null },
    { id: '00000000-0000-4000-8000-000000000001', restaurant: { name: 'C' }, order: null },
  ];
  prisma.payment.findMany = async query => {
    assert.equal(query.take, 3);
    assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.deepEqual(query.cursor, { id: records[2].id });
    assert.equal(query.skip, 1);
    return records;
  };
  const res = response();
  await new SuperAdminController().getTransactions({
    query: { limit: '2', cursor: records[2].id },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.pagination, {
    limit: 2, nextCursor: records[1].id, hasMore: true,
  });
  assert.deepEqual(res.body.payments.map(payment => payment.id), records.slice(0, 2).map(payment => payment.id));

  const invalid = response();
  await new SuperAdminController().getTransactions({ query: { cursor: 'not-a-uuid' } }, invalid);
  assert.equal(invalid.statusCode, 400);
});

test('P3: inventory recovery batches completion lookup instead of issuing an N+1 query', async () => {
  const priorRedis = process.env.REDIS_URL;
  const priorDurable = DeductionQueueService.durable;
  process.env.REDIS_URL = 'redis://p3-isolated-test';
  const calls = [];
  prisma.auditLog.findMany = async query => {
    calls.push(query);
    if (query.where.action === 'INVENTORY_DEDUCTION_PENDING') return [
      { entityId: 'done', metadata: { restaurantId: 'restaurant-1' } },
      { entityId: 'pending', metadata: { restaurantId: 'restaurant-1' } },
    ];
    assert.deepEqual(query.where.entityId.in, ['done', 'pending']);
    return [{ entityId: 'done' }];
  };
  prisma.auditLog.findFirst = async () => assert.fail('per-row completion lookup must not run');
  const queued = [];
  DeductionQueueService.durable = {
    enqueue: async (orderId, restaurantId) => queued.push([orderId, restaurantId]),
    drain: async () => {},
  };
  try {
    await DeductionQueueService.processPending();
  } finally {
    DeductionQueueService.durable = priorDurable;
    if (priorRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = priorRedis;
  }
  assert.equal(calls.length, 2);
  assert.deepEqual(queued, [['pending', 'restaurant-1']]);
});

test('P3: launch configuration and logging fail safely without embedded secrets', () => {
  assert.equal(appBaseUrl({ NODE_ENV: 'test' }), 'http://localhost:5173');
  assert.equal(appBaseUrl({ NODE_ENV: 'production', APP_BASE_URL: 'https://ordio.example/' }), 'https://ordio.example');
  assert.throws(() => appBaseUrl({ NODE_ENV: 'production' }), /APP_BASE_URL/);
  assert.throws(() => appBaseUrl({ APP_BASE_URL: 'https://user:secret@example.test' }), /without credentials/);

  const server = fs.readFileSync(path.join(__dirname, '../src/server.ts'), 'utf8');
  const publicController = fs.readFileSync(path.join(__dirname, '../src/controllers/public.controller.ts'), 'utf8');
  const adminScript = fs.readFileSync(path.join(__dirname, '../src/scripts/create-admin.ts'), 'utf8');
  const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  assert.doesNotMatch(server, /console\.error/);
  assert.doesNotMatch(publicController, /console\.error/);
  assert.doesNotMatch(adminScript, /const\s+(email|password)\s*=\s*['"]/);
  assert.match(schema, /@@index\(\[status, scheduledAt, id\]\)/);
  assert.match(schema, /@@index\(\[action, entityType, entityId\]\)/);
});

test('P3: authentication dependency failures return a stable error without leaking exception details', async t => {
  const logs = [];
  t.mock.method(console, 'error', entry => logs.push(entry));
  prisma.user.findUnique = async () => { throw new Error('postgresql://user:secret@private-host/database'); };
  const res = response();
  await new AuthController().login({ body: { email: 'person@example.test', password: 'valid-input' } }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Unable to sign in' });
  assert.doesNotMatch(JSON.stringify(logs), /user:secret|private-host/);
});
