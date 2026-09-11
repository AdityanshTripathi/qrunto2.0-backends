'use strict';
const { prisma, violations } = require('./support/isolation.cjs');
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const { fixtures } = require('./support/fixtures.cjs');
const { analyticsDates } = require('../dist/services/analytics-detail.service');
const { server, io } = require('../dist/server');
let base, db, a, b, rows, calls;
const date = value => new Date(value);
before(async () => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/analytics`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => io.close(resolve)); assert.equal(violations.length, 0); });
beforeEach(() => {
  db = fixtures(); a = db.tenant(1); b = db.tenant(2);
  rows = { rawMaterial: [], wastageRecord: [], stockLedger: [], order: [], payment: [], expenses: [] }; calls = [];
  const matches = (row, where = {}) => !!row && Object.entries(where).every(([key, condition]) => {
    if (key === 'order') return matches(rows.order.find(order => order.id === row.orderId), condition);
    if (key === 'rawMaterial') return matches(rows.rawMaterial.find(material => material.id === row.rawMaterialId), condition);
    if (condition && typeof condition === 'object') return Object.entries(condition).every(([operator, value]) => {
      if (operator === 'in') return value.includes(row[key]);
      if (operator === 'gte') return row[key] >= value;
      if (operator === 'lt') return row[key] < value;
      throw new Error('Unsupported fixture predicate');
    });
    return row[key] === condition;
  });
  const aggregate = (data, options) => ({
    _sum: Object.fromEntries(Object.keys(options._sum || {}).map(key => [key, data.length ? data.reduce((sum, row) => sum + (row[key] ?? 0), 0) : null])),
    _count: { id: data.length },
  });
  for (const model of Object.keys(rows)) for (const method of ['findMany', 'aggregate', 'groupBy']) {
    prisma[model][method] = async options => {
      calls.push({ model, method, ...options });
      const data = rows[model].filter(row => matches(row, options.where));
      if (method === 'findMany') return data.map(row => Object.fromEntries(Object.keys(options.select).map(key => [key, row[key]])));
      if (method === 'aggregate') return aggregate(data, options);
      const groups = new Map();
      for (const row of data) { const key = JSON.stringify(options.by.map(field => row[field])); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
      return [...groups.values()].map(group => ({ ...Object.fromEntries(options.by.map(key => [key, group[0][key]])), ...aggregate(group, options) }));
    };
  }

  prisma.orderItem.groupBy = async () => [];
  prisma.recipe.findMany = async () => [];
});
async function request(endpoint, query = 'startDate=2026-09-01&endDate=2026-09-01', user = a.user) {
  const response = await fetch(`${base}/${endpoint}?${query}`, {
    headers: user ? { Authorization: `Bearer ${jwt.sign({ id: user.id, restaurantId: b.restaurant.id }, process.env.JWT_SECRET)}` } : {},
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

test('Financial analytics: tenant-local midnight includes previous UTC day and excludes next local day', async () => {
  a.restaurant.timezone = 'Asia/Kolkata';
  const row = (id, createdAt, restaurantId = a.restaurant.id) => ({ id, restaurantId, status: 'PAID', createdAt: date(createdAt), subtotal: 10, taxAmount: 0, totalAmount: 10 });
  rows.order.push(row('midnight', '2026-08-31T19:00:00Z'), row('before', '2026-08-31T18:29:59.999Z'), row('next', '2026-09-01T18:30:00Z'), row('foreign', '2026-08-31T19:00:00Z', b.restaurant.id));
  const res = await request('financials');
  assert.equal(res.status, 200); assert.equal(res.body.summary.orders, 1); assert.equal(res.body.summary.net, 10);
  a.restaurant.timezone = 'UTC';
  const utc = await request('financials'); assert.equal(utc.body.summary.orders, 1);
  assert.ok(calls.every(call => (call.where.restaurantId ?? call.where.restaurant_id) === a.restaurant.id));
});

test('Analytics: registered routes require auth and return honest empty frontend contracts', async () => {
  for (const endpoint of ['inventory', 'financials']) assert.equal((await request(endpoint, '', null)).status, 401);
  assert.equal(calls.length, 0);
  const inventory = await request('inventory'); assert.equal(inventory.status, 200);
  assert.deepEqual(inventory.body, { value: { totalStockValue: 0, wastageCost: 0 }, consumption: [], turnover: [], lowStockCount: 0, outOfStockCount: 0, deadStockCount: 0 });
  const financial = await request('financials'); assert.equal(financial.status, 200);
  assert.deepEqual(financial.body, { summary: { gross: 0, net: 0, expenses: 0, cogs: 0, grossProfit: 0, operatingProfit: 0, profit: 0, gst: 0, grossMargin: 0, operatingMargin: 0, costBasis: 'estimated_current_recipe_cost', orders: 0, discounts: 0, refunds: 0 }, paymentMethods: { upi: 0, cash: 0, card: 0, other: 0 }, expenseBreakdown: [] });
});

test('Inventory: real fixture quantities, zero costs, duplicate names, dates and tenant isolation', async () => {
  const tenant = a.restaurant.id;
  const material = (id, values = {}) => ({ id, restaurantId: tenant, name: 'Rice', status: 'ACTIVE', unit: 'KG', currentStock: 10, minimumStockLevel: 10, averageCost: 2, purchasePrice: 99, ...values });
  rows.rawMaterial.push(material('one'), material('two', { currentStock: 0, minimumStockLevel: 0, averageCost: 0, unit: 'G' }), material('dead', { currentStock: 4, minimumStockLevel: 1, averageCost: 3 }), material('inactive', { status: 'INACTIVE' }), material('foreign', { restaurantId: b.restaurant.id }));
  const usage = (rawMaterialId, quantity, createdAt, restaurantId = tenant) => ({ rawMaterialId, quantity, restaurantId, createdAt: date(createdAt), actionType: 'SALE_DEDUCTION' });
  rows.stockLedger.push(usage('one', -2, '2026-09-01T00:00:00Z'), usage('one', -3, '2026-09-01T23:59:59.999Z'), usage('two', -4, '2026-09-01T12:00:00Z'), usage('one', -100, '2026-09-02T00:00:00Z'), usage('one', -100, '2026-08-31T23:59:59Z'), usage('one', 5, '2026-09-01T12:00:00Z'), usage('foreign', -500, '2026-09-01T12:00:00Z'), usage('one', -500, '2026-09-01T12:00:00Z', b.restaurant.id));
  rows.wastageRecord.push({ restaurantId: tenant, rawMaterialId: 'one', wasteDate: date('2026-09-01'), cost: 7 }, { restaurantId: tenant, rawMaterialId: 'foreign', wasteDate: date('2026-09-01'), cost: 999 });
  const res = await request('inventory', `startDate=2026-09-01&endDate=2026-09-01&restaurantId=${b.restaurant.id}`);
  assert.equal(res.status, 200); assert.deepEqual(res.body.value, { totalStockValue: 32, wastageCost: 7 });
  assert.deepEqual(res.body.consumption.map(row => [row.materialId, row.quantity, row.cost]), [['one', 5, 10], ['two', 4, 0]]);
  assert.deepEqual(res.body.turnover.map(row => row.turnoverRatio), [0.5, null]);
  assert.equal(res.body.lowStockCount, 2); assert.equal(res.body.outOfStockCount, 1); assert.equal(res.body.deadStockCount, 1);
  assert.equal(calls.length, 3); assert.ok(calls.every(call => call.where.restaurantId === tenant));
  rows.rawMaterial[0].currentStock = 20;
  assert.equal((await request('inventory')).body.value.totalStockValue, 52);
});

test('Financials: aggregate orders once, refunds, discounts, expenses and actual payment methods', async () => {
  const tenant = a.restaurant.id;
  const order = (id, values = {}) => ({ id, restaurantId: tenant, status: 'PAID', createdAt: date('2026-09-01T00:00:00Z'), subtotal: 100, taxAmount: 10, totalAmount: 100, ...values });
  rows.order.push(order('one'), order('two', { status: 'SERVED', subtotal: 50, taxAmount: 5, totalAmount: 55, createdAt: date('2026-09-01T23:59:59.999Z') }), order('cancelled', { status: 'CANCELLED' }), order('pending', { status: 'NEW' }), order('foreign', { restaurantId: b.restaurant.id }), order('old', { createdAt: date('2026-08-31T23:59:59Z') }), order('next', { createdAt: date('2026-09-02T00:00:00Z') }));
  const payment = (orderId, amount, paymentMethod, values = {}) => ({ restaurantId: tenant, orderId, amount, paymentMethod, status: 'SUCCESS', refundedAmount: 0, paidAt: date('2026-09-01T12:00:00Z'), ...values });
  rows.payment.push(payment('one', 70, 'UPI', { refundedAmount: 20 }), payment('one', 30, 'CASH'), payment('two', 55, 'CARD', { status: 'REFUNDED', refundedAmount: 55 }), payment('one', 900, 'UPI', { status: 'FAILED' }), payment('cancelled', 900, 'UPI'), payment('foreign', 900, 'UPI'), payment('one', 900, 'UPI', { restaurantId: b.restaurant.id, refundedAmount: 900 }));
  rows.expenses.push({ restaurant_id: tenant, category: 'RENT', amount: 20, expense_date: date('2026-09-01') }, { restaurant_id: tenant, category: 'OPERATIONAL', amount: 5, expense_date: date('2026-09-01T23:59:59.999Z') }, { restaurant_id: b.restaurant.id, category: 'RENT', amount: 900, expense_date: date('2026-09-01') });
  const res = await request('financials'); assert.equal(res.status, 200);
  assert.deepEqual(res.body.summary, { gross: 165, net: 80, expenses: 25, cogs: 0, grossProfit: 80, operatingProfit: 55, profit: 55, gst: 15, grossMargin: 100, operatingMargin: 68.8, costBasis: 'estimated_current_recipe_cost', orders: 2, discounts: 10, refunds: 75 });
  assert.deepEqual(res.body.paymentMethods, { upi: 50, cash: 30, card: 0, other: 0 });
  assert.equal(res.body.expenseBreakdown.length, 2); assert.equal(calls.length, 4);
  assert.ok(calls.every(call => (call.where.restaurantId ?? call.where.restaurant_id) === tenant));
  rows.payment.push(payment('one', 7, null));
  assert.equal((await request('financials')).body.paymentMethods.other, 7);
  const narrow = await request('financials', 'startDate=2026-09-02&endDate=2026-09-02');
  assert.equal(narrow.body.summary.orders, 1); assert.equal(narrow.body.summary.expenses, 0);
});

test('Financials: recipe COGS drives gross and operating profit', async () => {
  const tenant = a.restaurant.id;

  rows.order.push({
    id: 'cogs-order',
    restaurantId: tenant,
    status: 'PAID',
    createdAt: date('2026-09-01T12:00:00Z'),
    subtotal: 100,
    taxAmount: 0,
    totalAmount: 100
  });

  rows.expenses.push({
    restaurant_id: tenant,
    category: 'RENT',
    amount: 10,
    expense_date: date('2026-09-01T12:00:00Z')
  });

  prisma.orderItem.groupBy = async q => {
    assert.equal(q.where.order.restaurantId, tenant);
    return [{ menuItemId: 'menu-cogs', _sum: { quantity: 2 } }];
  };

  prisma.recipe.findMany = async q => {
    assert.equal(q.where.menuItem.restaurantId, tenant);
    return [{
      menuItemId: 'menu-cogs',
      ingredients: [{
        quantity: 500,
        rawMaterial: {
          unit: 'KG',
          averageCost: 20,
          purchasePrice: 25
        }
      }]
    }];
  };

  const res = await request('financials');
  assert.equal(res.status, 200);
  assert.equal(res.body.summary.net, 100);
  assert.equal(res.body.summary.cogs, 20);
  assert.equal(res.body.summary.grossProfit, 80);
  assert.equal(res.body.summary.operatingProfit, 70);
  assert.equal(res.body.summary.profit, 70);
  assert.equal(res.body.summary.grossMargin, 80);
  assert.equal(res.body.summary.operatingMargin, 70);
  assert.equal(res.body.summary.costBasis, 'estimated_current_recipe_cost');
});

test('Analytics: malformed dates and unlinked sessions fail before analytics reads', async () => {
  for (const endpoint of ['inventory', 'financials']) {
    for (const query of ['startDate=bad', 'startDate=2026-02-30', 'startDate=2026-09-02&endDate=2026-09-01', 'startDate=2026-09-01&startDate=2026-09-02']) assert.equal((await request(endpoint, query)).status, 400);
  }
  assert.equal(calls.length, 0);
  a.user.restaurantId = null; a.restaurant.ownerId = 'unlinked';
  assert.equal((await request('inventory')).status, 400);
  assert.equal((await request('financials')).status, 400);
  const range = analyticsDates('2024-02-29', '2024-02-29');
  assert.equal(range.lt.toISOString(), '2024-03-01T00:00:00.000Z');
});

test('Analytics: database errors are redacted, never replaced with fake data', async t => {
  const logs = []; t.mock.method(console, 'error', row => logs.push(row));
  prisma.order.aggregate = async () => { throw new Error('synthetic-private-credential'); };
  const res = await request('financials'); assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Analytics unavailable' });
  assert.ok(!JSON.stringify(logs).includes('synthetic-private-credential'));
});
