'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { prisma, violations } = require('./support/isolation.cjs');
const { fixtures } = require('./support/fixtures.cjs');
const tz = require('../dist/lib/timezone');
const { analyticsDates } = require('../dist/services/analytics-detail.service');
const { OrderRepository } = require('../dist/repositories/order.repository');
const { AnalyticsController } = require('../dist/controllers/analytics.controller');
const { ReportService } = require('../dist/services/inventory/report.service');
const { SegmentService } = require('../dist/services/crm/segment.service');
const { RFMService } = require('../dist/services/crm/rfm.service');
const { OccasionService } = require('../dist/services/crm/occasion.service');
const { SettingsController } = require('../dist/controllers/settings.controller');
const { AuthController } = require('../dist/controllers/auth.controller');
const iso = date => date.toISOString();
const now = new Date('2026-08-31T19:00:00Z'); // Sep 1, 00:30 in Kolkata.
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function mock(t, object, method, implementation) {
  void object[method]; // Materialize the isolation proxy's lazy method descriptor.
  return t.mock.method(object, method, implementation);
}
after(() => assert.equal(violations.length, 0));

test('Timezone: IST midnight, previous UTC day, today/yesterday and month boundary', () => {
  assert.equal(tz.localDate(now, 'Asia/Kolkata'), '2026-09-01');
  const today = tz.dateRange(undefined, undefined, 'Asia/Kolkata', now, 0);
  assert.equal(iso(today.gte), '2026-08-31T18:30:00.000Z');
  assert.equal(iso(today.lt), '2026-09-01T18:30:00.000Z');
  assert.ok(now >= today.gte && now < today.lt);
  const yesterday = tz.dateRange('2026-08-31', '2026-08-31', 'Asia/Kolkata');
  assert.equal(+yesterday.lt, +today.gte);
  assert.equal(tz.localDate(new Date(+today.gte - 1), 'Asia/Kolkata'), '2026-08-31');
  assert.equal(iso(tz.dateRange('2026-09-01', '2026-09-30', 'Asia/Kolkata').lt), '2026-09-30T18:30:00.000Z');
});

test('Timezone: UTC, DST spring/fall, half-hour DST and midnight transition', () => {
  assert.equal(iso(tz.dayStart('2026-09-01', 'UTC')), '2026-09-01T00:00:00.000Z');
  for (const [day, zone, hours] of [
    ['2026-03-08', 'America/New_York', 23], ['2026-11-01', 'America/New_York', 25],
    ['2026-10-04', 'Australia/Lord_Howe', 23.5], ['2018-11-04', 'America/Sao_Paulo', 23],
  ]) {
    const range = tz.dateRange(day, day, zone);
    assert.equal((range.lt - range.gte) / 3600000, hours);
    assert.equal(tz.localDate(range.gte, zone), day);
    assert.equal(tz.localDate(new Date(+range.lt - 1), zone), day);
  }
  const skipped = tz.dateRange('2011-12-30', '2011-12-30', 'Pacific/Apia');
  assert.equal(+skipped.gte, +skipped.lt);
});

test('Timezone: invalid/missing fallback, invalid date rejection and offset instants', () => {
  for (const value of [undefined, null, '', 'invalid', '+05:30']) assert.equal(tz.timezone(value), 'Asia/Kolkata');
  assert.equal(tz.timezone('UTC'), 'UTC');
  for (const date of ['2026-02-30', '2026-13-01', 'garbage']) assert.throws(() => tz.dayStart(date, 'UTC'), tz.BusinessDateError);
  assert.throws(() => tz.dateRange('2026-09-02', '2026-09-01', 'UTC'));
  assert.equal(iso(tz.dateInput('2026-09-01T00:30:00+05:30', 'UTC')), iso(now));
  assert.equal(iso(tz.dateInput('2026-09-01', 'Asia/Kolkata', true)), '2026-09-01T18:29:59.999Z');
  assert.throws(() => tz.dateInput('2026-09-01T00:30', 'UTC'));
});

test('Timezone: local campaign time, DST gap rejection, overlap policy and occasion calendar dates', () => {
  assert.equal(iso(tz.localDateTime('2026-09-01T00:30', 'Asia/Kolkata')), iso(now));
  assert.throws(() => tz.localDateTime('2026-03-08T02:30', 'America/New_York'));
  assert.equal(iso(tz.localDateTime('2026-11-01T01:30', 'America/New_York')), '2026-11-01T05:30:00.000Z');
  assert.equal(tz.occasionDays('1990-09-01', now, 'Asia/Kolkata'), 0);
  assert.equal(tz.occasionDays('1990-09-01', now, 'UTC'), 1);
});

test('Timezone: date-range analytics uses local inclusive dates, DST-safe exclusive end', () => {
  const range = analyticsDates('2026-03-08', '2026-03-09', now, 'America/New_York');
  assert.equal(iso(range.gte), '2026-03-08T05:00:00.000Z');
  assert.equal(iso(range.lt), '2026-03-10T04:00:00.000Z');
  assert.equal((range.lt - range.gte) / 3600000, 47);
});

test('Timezone: order date filters use tenant setting and isolate identical midnight orders', async () => {
  const db = fixtures(), a = db.tenant(1), b = db.tenant(2);
  a.restaurant.timezone = 'Asia/Kolkata'; b.restaurant.timezone = 'UTC';
  for (const tenant of [a, b]) db.data.orders.push({ id: db.id(100 + Number(tenant === b)), restaurantId: tenant.restaurant.id, tableId: tenant.table.id, createdAt: now, status: 'SERVED' });
  const repo = new OrderRepository();
  const filter = { date: new Date('2026-09-01') };
  assert.equal((await repo.findMany(a.restaurant.id, filter, { limit: 30 })).orders.length, 1);
  assert.equal((await repo.findMany(b.restaurant.id, filter, { limit: 30 })).orders.length, 0);
  assert.equal(await tz.restaurantTimezone(a.restaurant.id), 'Asia/Kolkata');
  assert.equal(await tz.restaurantTimezone(b.restaurant.id), 'UTC');
});

test('Timezone: dashboard today query and chart bucket include 00:30 local order', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const db = fixtures(), a = db.tenant(1); a.restaurant.timezone = 'Asia/Kolkata';
  let aggregateWhere;
  mock(t, prisma.order, 'aggregate', async q => { aggregateWhere = q.where; return { _sum: { totalAmount: 10 }, _count: { id: 1 }, _avg: { totalAmount: 10 } }; });
  mock(t, prisma.order, 'findMany', async () => [{ createdAt: now, totalAmount: 10 }]);
  mock(t, prisma.restaurantTable, 'count', async () => 1);
  mock(t, prisma.restaurantTable, 'findMany', async () => []);
  mock(t, prisma.orderItem, 'groupBy', async () => []);
  mock(t, prisma.order, 'groupBy', async () => []);
  const res = response(); await new AnalyticsController().getOverview({ user: a.user, query: {} }, res);
  assert.equal(res.code, 200); assert.equal(aggregateWhere.restaurantId, a.restaurant.id);
  assert.equal(iso(aggregateWhere.createdAt.gte), '2026-08-31T18:30:00.000Z');
  assert.equal(res.body.trendData.at(-1).revenue, 10);
});

test('Timezone: inventory dashboard uses tenant day for usage, receipts and waste', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const db = fixtures(), a = db.tenant(1); a.restaurant.timezone = 'Asia/Kolkata';
  const calls = [];
  for (const model of ['rawMaterial', 'stockLedger', 'purchaseOrder']) mock(t, prisma[model], 'findMany', async q => { calls.push(q); return []; });
  mock(t, prisma.wastageRecord, 'aggregate', async q => { calls.push(q); return { _sum: { cost: 0 } }; });
  await new ReportService().getDashboardMetrics(a.restaurant.id);
  assert.ok(calls.every(q => q.where.restaurantId === a.restaurant.id));
  for (const q of calls.slice(1)) {
    const range = q.where.createdAt || q.where.receivedDate || q.where.wasteDate;
    assert.equal(iso(range.gte), '2026-08-31T18:30:00.000Z');
  }
});

test('Timezone: CRM recency uses each brand restaurant profile without crossing tenant scope', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const db = fixtures(), a = db.tenant(1), b = db.tenant(2);
  a.restaurant.timezone = 'Asia/Kolkata'; b.restaurant.timezone = 'America/New_York';
  mock(t, prisma.segment, 'findUnique', async () => ({ id: 'segment', brandId: 'brand', criteriaJson: { visitedWithinDays: 1 } }));
  mock(t, prisma.restaurant, 'findMany', async q => { assert.deepEqual(q.where, { brandId: 'brand' }); return [a.restaurant, b.restaurant]; });
  let where;
  mock(t, prisma.customer, 'findMany', async q => { where = q.where; return []; });
  mock(t, prisma.customerSegment, 'deleteMany', async () => ({ count: 0 }));
  await new SegmentService().evaluateSegment('segment', 'brand');
  assert.equal(where.brandId, 'brand');
  const branches = where.profiles.some.OR;
  assert.equal(branches[0].restaurantId, a.restaurant.id);
  assert.equal(iso(branches[0].lastVisit.gte), '2026-08-30T18:30:00.000Z');
  assert.equal(iso(branches[1].lastVisit.gte), '2026-08-30T04:00:00.000Z');
  assert.equal(tz.calendarDaysSince(new Date('2026-03-08T05:30:00Z'), new Date('2026-03-09T04:30:00Z'), 'America/New_York'), 1);
  await assert.rejects(new SegmentService().evaluateSegment('segment', 'other-brand'));
});

test('Timezone: RFM calendar recency and occasions use profile restaurant timezone', async t => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const profile = { lastVisit: new Date('2026-08-31T18:00:00Z'), totalOrders: 1, totalSpend: 10, restaurant: { id: 'a', brandId: 'brand', timezone: 'Asia/Kolkata' } };
  const customer = { id: 'c', brandId: 'brand', name: 'Guest', phone: 'test', createdAt: now, profiles: [profile], metadataJson: { birthday: '1990-09-01' } };
  mock(t, prisma.customer, 'findMany', async () => [customer]);
  mock(t, prisma.customer, 'update', async () => customer);
  const rfm = await new RFMService().calculateRFM('brand'); assert.equal(rfm[0].recencyDays, 1);
  const notices = []; mock(t, prisma.notification, 'create', async q => notices.push(q.data));
  mock(t, console, 'log', () => {});
  const result = await new OccasionService().checkAndSendOccasionMessages();
  assert.equal(result.length, 1); assert.equal(notices[0].restaurantId, 'a');
  const upcoming = await new OccasionService().getUpcomingOccasions('brand'); assert.equal(upcoming[0].daysRemaining, 0);
});

test('Timezone: settings reject invalid IANA timezone before mutation', async () => {
  const db = fixtures(), a = db.tenant(1), res = response();
  await new SettingsController().updateSettings({ user: a.user, body: { timezone: 'Mars/Olympus' } }, res);
  assert.equal(res.code, 400);
});

test('Timezone: display metadata follows authenticated tenant, not first owned restaurant', async () => {
  const db = fixtures(), a = db.tenant(1), b = db.tenant(2), res = response();
  a.restaurant.timezone = 'Asia/Kolkata'; b.restaurant.timezone = 'America/New_York';
  a.user.restaurantId = b.restaurant.id;
  await new AuthController().me({ user: a.user }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.user.restaurants[0].id, a.restaurant.id);
  assert.equal(res.body.user.restaurantTimezone, 'America/New_York');
});

test('Timezone: settings update only authenticated tenant and expose the selected timezone', async t => {
  const db = fixtures(), a = db.tenant(1), b = db.tenant(2), res = response();
  mock(t, prisma.restaurant, 'update', async q => {
    assert.equal(q.where.id, a.restaurant.id);
    assert.deepEqual(q.data, { timezone: 'America/New_York' });
    return { ...a.restaurant, ...q.data };
  });
  mock(t, prisma.restaurantSetting, 'upsert', async q => {
    assert.equal(q.where.restaurantId, a.restaurant.id); return a.restaurant.settings;
  });
  await new SettingsController().updateSettings({ user: a.user, body: { restaurantId: b.restaurant.id, timezone: 'America/New_York' } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.restaurant.timezone, 'America/New_York');
  assert.equal(b.restaurant.timezone, 'UTC');
});

test('Timezone: sales analytics on 25-hour DST day uses hourly chart and local heatmap', async t => {
  const db = fixtures(), a = db.tenant(1); a.restaurant.timezone = 'America/New_York';
  const first = new Date('2026-11-01T05:30:00Z'), second = new Date('2026-11-01T06:30:00Z');
  mock(t, prisma.order, 'findMany', async q => {
    assert.equal(q.where.restaurantId, a.restaurant.id);
    assert.equal(iso(q.where.createdAt.gte), '2026-11-01T04:00:00.000Z');
    assert.equal(iso(q.where.createdAt.lte), '2026-11-02T04:59:59.999Z');
    return [first, second].map(createdAt => ({ createdAt, totalAmount: 10 }));
  });
  mock(t, prisma.orderItem, 'groupBy', async () => []);
  mock(t, prisma.menuItem, 'findMany', async () => []);
  const res = response();
  await new AnalyticsController().getSales({ user: a.user, query: { startDate: '2026-11-01', endDate: '2026-11-01' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.trends, [{ timeLabel: '1:00', revenue: 20, orders: 2 }]);
  assert.deepEqual(res.body.heatmap, [{ day: 'Sunday', hour: 1, revenue: 20 }]);
  assert.equal(res.body.metrics.bestDay.date, '2026-11-01');
  assert.notEqual(tz.localHourKey(first, a.restaurant.timezone), tz.localHourKey(second, a.restaurant.timezone));
});

test('Timezone: calculations are independent of machine timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const machine of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = machine;
      assert.equal(iso(tz.dayStart('2026-09-01', 'Asia/Kolkata')), '2026-08-31T18:30:00.000Z');
      assert.equal(tz.localDate(now, 'UTC'), '2026-08-31');
    }
  } finally { process.env.TZ = previous; }
});

