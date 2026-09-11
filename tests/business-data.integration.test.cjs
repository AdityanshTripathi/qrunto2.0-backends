'use strict';
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { prisma, violations } = require('./support/isolation.cjs');
const { fixtures } = require('./support/fixtures.cjs');
// Targeted runs can load only the changed TS modules; normal CI uses its compiled build.
const source = Boolean(require.extensions['.ts']);
if (source) {
  const file = path.resolve(__dirname, '../src/lib/prisma.ts');
  require.cache[file] = { id: file, filename: file, loaded: true, exports: { prisma } };
}
const prefix = source ? '../src' : '../dist';
const { AnalyticsController } = require(`${prefix}/controllers/analytics.controller`);
const { CampaignService } = require(`${prefix}/services/crm/campaign.service`);
const { decimal } = require(`${prefix}/lib/money`);
let db, a, b, rows, calls;
const date = value => new Date(value);
const matches = (row, where = {}) => !!row && Object.entries(where).every(([key, value]) => {
  if (key === 'order') return matches(rows.orders.find(o => o.id === row.orderId), value);
  if (key === 'menuItem') return row.restaurantId === value.restaurantId;
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
    if (op === 'gte') return row[key] >= expected;
    if (op === 'lte') return row[key] <= expected;
    if (op === 'lt') return row[key] < expected;
    if (op === 'not') return row[key] !== expected;
    if (op === 'in') return expected.includes(row[key]);
    throw Error(`Unsupported fixture predicate ${op}`);
  });
  return row[key] === value;
});
beforeEach(() => {
  db = fixtures(); a = db.tenant(1); b = db.tenant(2); calls = [];
  rows = { profiles: [], orders: [], ledger: [], coupons: [], carts: [], views: [], sales: [], recipes: [] };
  for (const [model, key] of [['customerRestaurantProfile','profiles'],['order','orders'],['loyaltyLedger','ledger'],['customerCoupon','coupons'],['cartSession','carts'],['menuViewLog','views'],['orderItem','sales'],['recipe','recipes']]) {
    for (const method of ['findMany','count','groupBy']) prisma[model][method] = async q => {
      calls.push({ model, method, ...q });
      const data = rows[key].filter(row => matches(row, q.where));
      if (method === 'count') return data.length;
      if (method === 'findMany') return data;
      const groups = new Map();
      for (const row of data) { const id = JSON.stringify(q.by.map(k => row[k])); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(row); }
      return [...groups.values()].map(group => ({ ...Object.fromEntries(q.by.map(k => [k, group[0][k]])), _count: { id: group.length }, _sum: Object.fromEntries(Object.keys(q._sum ?? {}).map(k => {
        const sum = group.reduce((sum, row) => sum.plus(row[k] ?? 0), decimal(0));
        return [k, ['points', 'quantity'].includes(k) ? sum.toNumber() : sum];
      })) }));
    }
  }
});
after(() => assert.equal(violations.length, 0));
async function analytics(method, startDate = '2026-07-01', endDate = '2026-08-31') {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await new AnalyticsController()[method]({ user: a.user, query: { restaurantId: b.restaurant.id, startDate, endDate } }, res);
  assert.equal(res.code, 200, JSON.stringify(res.body)); return res.body;
}
const order = (id, extra = {}) => ({ id, restaurantId: a.restaurant.id, customerId: 'customer', status: 'PAID', createdAt: date('2026-07-10T10:00Z'), updatedAt: date('2026-07-10T10:00Z'), orderItems: [], totalAmount: decimal('0.10'), ...extra });
const profile = (id, extra = {}) => ({ customerId: id, restaurantId: a.restaurant.id, firstVisit: date('2026-07-01T00:00Z'), lastVisit: date('2026-08-02T00:00Z'), totalSpend: decimal(0), ltv: decimal(0), visitFrequency: 0, customer: { birthday: null, anniversary: null }, ...extra });

test('Business data: empty customer, loyalty, menu and order APIs expose honest contracts', async () => {
  const customers = await analytics('getCustomers');
  assert.deepEqual(customers.summary, { total: 0, new: 0, returning: 0 });
  assert.deepEqual(customers.retentionMatrix, []); assert.equal(customers.behavior.frequencyDays, null);
  const loyalty = await analytics('getLoyalty');
  assert.deepEqual(loyalty, { members: { joined: 0, active: 0 }, points: { issued: 0, redeemed: 0, redemptionRate: 0 }, couponRoi: [] });
  assert.deepEqual(await analytics('getMenu'), { menuPerformance: [], bundles: [] });
  const orders = await analytics('getOrders');
  assert.deepEqual(orders.timing, { avgPrepTime: null, avgDeliveryTime: null, avgTableTurnaround: null, delayPercentage: { kitchen: null, waiter: null } });
  assert.deepEqual(orders.conversion, { qrViews: 0, cartSessions: 0, ordersPlaced: 0, cartAbandonmentRate: null });
});

test('Business data: cohorts/new/returning use scoped local-month visits and distinct customers', async () => {
  a.restaurant.timezone = 'Asia/Kolkata';
  rows.profiles.push(profile('one', { firstVisit: date('2026-06-30T19:00Z') }), profile('two'), profile('returning', { firstVisit: date('2026-06-01') }), profile('foreign', { restaurantId: b.restaurant.id }));
  rows.orders.push(order('visit1', { customerId: 'one', createdAt: date('2026-08-01') }), order('visit2', { customerId: 'one', createdAt: date('2026-08-02') }), order('return', { customerId: 'returning' }), order('foreign', { customerId: 'two', restaurantId: b.restaurant.id }), order('cancel', { customerId: 'two', status: 'CANCELLED' }));
  const data = await analytics('getCustomers');
  assert.deepEqual(data.summary, { total: 3, new: 2, returning: 1 });
  assert.deepEqual(data.retentionMatrix, [{ cohort: 'Jul 2026', size: 2, m1: 1, m2: null, m3: null }]);
  assert.ok(calls.every(q => q.where.restaurantId === a.restaurant.id));
  assert.equal((await analytics('getCustomers', '2026-07-01', '2026-09-30')).retentionMatrix[0].m2, 0);
});

test('Business data: loyalty excludes another restaurant sharing an account; coupon totals retain Decimal precision', async () => {
  rows.orders.push(order('a'), order('a2', { totalAmount: decimal('0.20') }), order('b', { restaurantId: b.restaurant.id }));
  rows.ledger.push({ orderId: 'a', transactionType: 'EARN', points: 1200, createdAt: date('2026-07-10') }, { orderId: 'a', transactionType: 'REDEMPTION', points: -100, createdAt: date('2026-07-10') }, { orderId: 'b', transactionType: 'EARN', points: 9999, createdAt: date('2026-07-10') }, { orderId: null, transactionType: 'EARN', points: 500, createdAt: date('2026-07-10') });
  rows.coupons.push(...rows.orders.map(o => ({ orderId: o.id, order: o, coupon: { code: 'REAL' }, isRedeemed: true })));
  const data = await analytics('getLoyalty');
  assert.equal(data.points.issued, 1200); assert.equal(data.points.redeemed, 100); assert.equal(data.points.redemptionRate, 8.3);
  assert.deepEqual(data.couponRoi, [{ code: 'REAL', redemptions: 2, revenueLift: 0.3 }]);
  assert.equal(calls.find(q => q.model === 'loyaltyLedger').where.order.restaurantId, a.restaurant.id);
});

test('Business data: real order timings and abandonment do not inflate the observed funnel', async () => {
  rows.orders.push(order('one', { prepStartedAt: date('2026-07-10T10:10Z'), servedAt: date('2026-07-10T10:30Z') }), order('foreign', { restaurantId: b.restaurant.id }));
  rows.carts.push(...[true,false,false,true,false].map(isAbandoned => ({ restaurantId: a.restaurant.id, createdAt: date('2026-07-10'), isAbandoned })));
  const data = await analytics('getOrders');
  assert.equal(data.conversion.qrViews, 0); assert.equal(data.conversion.cartSessions, 5); assert.equal(data.conversion.ordersPlaced, 1); assert.equal(data.conversion.cartAbandonmentRate, 40);
  assert.equal(data.timing.avgPrepTime, 20); assert.equal(data.timing.avgDeliveryTime, 30); assert.equal(data.timing.delayPercentage.kitchen, 0);
  assert.equal(data.timing.delayPercentage.waiter, null); assert.equal(data.timing.avgTableTurnaround, null);
  assert.ok(calls.every(q => q.where.restaurantId === a.restaurant.id));
});

test('Business data: menu has real recipe costs or null, never fabricated views/profit', async () => {
  rows.orders.push(order('a'), order('b', { restaurantId: b.restaurant.id }));
  rows.sales.push({ orderId: 'a', menuItemId: 'costed', itemName: 'Costed', quantity: 2, totalPrice: decimal('1.00') }, { orderId: 'a', menuItemId: 'unknown', itemName: 'Unknown', quantity: 1, totalPrice: decimal('9.00') }, { orderId: 'b', menuItemId: 'foreign', itemName: 'Foreign', quantity: 999, totalPrice: decimal(999) });
  rows.recipes.push({ restaurantId: a.restaurant.id, menuItemId: 'costed', ingredients: [{ quantity: 3, rawMaterial: { averageCost: decimal('0.10'), purchasePrice: decimal(99) } }] });
  const data = await analytics('getMenu');
  const costed = data.menuPerformance.find(item => item.id === 'costed'), unknown = data.menuPerformance.find(item => item.id === 'unknown');
  assert.equal(costed.cost, 0.6); assert.equal(costed.profit, 0.4); assert.equal(unknown.cost, null); assert.equal(unknown.profit, null);
  assert.equal(data.menuPerformance.length, 2); assert.ok(data.menuPerformance.every(item => item.views === null && item.conversion === null));
});

test('Business data: unconfigured campaign delivery cannot record successful sends', async t => {
  const campaign = { id: 'campaign', brandId: 'brand', name: 'Test', channel: 'SMS', segmentId: null, status: 'QUEUED', attemptCount: 0 };
  const log = { campaignId: 'campaign', customerId: 'customer', status: 'PENDING', attemptCount: 0, error: null };
  prisma.campaign.updateMany = async q => {
    assert.equal(q.where.brandId, 'brand');
    if (q.where.status?.in && !q.where.status.in.includes(campaign.status)) return { count: 0 };
    if (q.where.attemptCount?.lt !== undefined && campaign.attemptCount >= q.where.attemptCount.lt) return { count: 0 };
    if (q.data.attemptCount?.increment) campaign.attemptCount += q.data.attemptCount.increment;
    Object.assign(campaign, q.data, { attemptCount: campaign.attemptCount });
    return { count: 1 };
  };
  prisma.campaign.findFirst = async q => { assert.equal(q.where.brandId, 'brand'); return campaign; };
  prisma.customer.findMany = async q => { assert.deepEqual(q.where, { brandId: 'brand' }); return [{ id: 'customer' }]; };
  prisma.campaignLog.createMany = async () => ({ count: 1 });
  prisma.campaignLog.findMany = async () => [log];
  prisma.campaignLog.updateMany = async q => {
    if (q.where.attemptCount !== undefined && q.where.attemptCount !== log.attemptCount) return { count: 0 };
    if (q.data.attemptCount?.increment) log.attemptCount += q.data.attemptCount.increment;
    Object.assign(log, q.data, { attemptCount: log.attemptCount });
    return { count: 1 };
  };
  t.mock.method(console, 'log', () => {}); t.mock.method(console, 'error', () => {});
  assert.equal(await new CampaignService().sendCampaign('campaign', 'brand'), false);
  assert.equal(log.status, 'FAILED'); assert.equal(log.attemptCount, 1);
  assert.equal(campaign.status, 'FAILED'); assert.equal(campaign.attemptCount, 1);
});
