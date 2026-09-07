'use strict';
const { violations, prisma } = require('./support/isolation.cjs');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const { fixtures } = require('./support/fixtures.cjs');
const { DeductionQueueService } = require('../dist/services/inventory/deduction-queue.service');
const { DurableDeductionQueue } = require('../dist/services/inventory/durable-deduction-queue');
const { app, server, io } = require('../dist/server');
let base, db, a, b;
const token = user => jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
async function request(route, { method = 'GET', body, auth } = {}) {
  const response = await fetch(`${base}${route}`, {
    method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000),
  });
  assert.ok(require('../dist/lib/request-context').sanitizeRequestId(response.headers.get('x-request-id')));
  return { status: response.status, body: await response.json(), requestId: response.headers.get('x-request-id') };
}
async function order(tenant = a, extra = {}) {
  return request(`/api/public/${tenant.restaurant.slug}/orders`, { method: 'POST', body: {
    tableNumber: '1', items: [{ menuItemId: tenant.menu.id, quantity: 2, unitPrice: 0 }], ...extra,
  } });
}
before(async () => {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  db = fixtures(); a = db.tenant(1); b = db.tenant(2);
  const { loginRateLimiter, registrationRateLimiter } = require('../dist/middlewares/auth-rate-limit.middleware');
  loginRateLimiter.resetKey('127.0.0.1'); registrationRateLimiter.resetKey('127.0.0.1');
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => io.close(resolve));
  assert.equal(violations.length, 0, 'No external connections or unconfigured DB operations');
});

test('Auth: register, bcrypt login, refresh and protected profile', async () => {
  const credentials = { name: 'Test Owner', email: 'owner@example.test', password: 'test-password-only', restaurantName: 'Test Restaurant' };
  const registered = await request('/api/auth/register', { method: 'POST', body: credentials });
  assert.equal(registered.status, 201);
  assert.ok(typeof registered.body.tokens.accessToken === 'string');
  assert.ok(db.data.users.find(u => u.email === credentials.email).password !== credentials.password);
  const login = await request('/api/auth/login', { method: 'POST', body: credentials });
  assert.equal(login.status, 200);
  const profile = await request('/api/auth/me', { auth: login.body.tokens.accessToken });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.email, credentials.email);
  assert.equal(Object.hasOwn(profile.body.user, 'password'), false);
  assert.equal((await request('/api/auth/refresh', { method: 'POST', body: { refreshToken: login.body.tokens.refreshToken } })).status, 200);
  assert.equal((await request('/api/auth/register', { method: 'POST', body: credentials })).status, 400);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { ...credentials, password: 'wrong' } })).status, 401);
});

test('Auth: missing, invalid, expired, wrong-key and disabled-user tokens rejected', async () => {
  const candidates = [undefined, 'invalid', jwt.sign({ id: a.user.id }, 'wrong-test-key'), jwt.sign({ id: a.user.id }, process.env.JWT_SECRET, { expiresIn: -1 })];
  for (const auth of candidates) assert.equal((await request('/api/orders', { auth })).status, 401);
  a.user.isActive = false;
  assert.equal((await request('/api/orders', { auth: token(a.user) })).status, 401);
  assert.equal((await request('/api/auth/refresh', { method: 'POST', body: { refreshToken: 'invalid' } })).status, 401);
});

test('Auth: login and registration limits return 429 deterministically', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'missing@example.test', password: 'wrong' } })).status, 401);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'missing@example.test', password: 'wrong' } })).status, 429);
  for (let i = 0; i < 5; i++) assert.equal((await request('/api/auth/register', { method: 'POST', body: {} })).status, 400);
  assert.equal((await request('/api/auth/register', { method: 'POST', body: {} })).status, 429);
});

test('Orders: public create uses server prices; authenticated read/update/stats', async () => {
  const created = await order(a, { restaurantId: b.restaurant.id, totalAmount: 1 });
  assert.equal(created.status, 201); assert.equal(created.body.order.totalAmount, 220);
  const id = created.body.order.id;
  assert.equal(db.data.orders[0].restaurantId, a.restaurant.id);
  assert.equal((await request(`/api/orders/${id}`, { auth: token(a.user) })).status, 200);
  const updated = await request(`/api/orders/${id}/status`, { method: 'PATCH', auth: token(a.user), body: { status: 'PREPARING', restaurantId: b.restaurant.id } });
  assert.equal(updated.status, 200); assert.equal(updated.body.order.status, 'PREPARING');
  assert.equal((await request(`/api/orders/${id}/status`, { method: 'PATCH', auth: token(a.user), body: { status: 'SERVED' } })).status, 400);
  const stats = await request('/api/orders/stats', { auth: token(a.user) });
  assert.equal(stats.status, 200); assert.equal(stats.body.stats.PREPARING, 1);
  assert.ok(db.queries.filter(q => ['findFirst', 'updateMany', 'groupBy'].includes(q.operation)).every(q => q.where.restaurantId === a.restaurant.id));
});

test('Orders: cursor pages have no duplicates, limits clamp, malformed cursor rejected', async () => {
  for (let i = 0; i < 3; i++) await order();
  await order(b);
  const first = await request('/api/orders?limit=2', { auth: token(a.user) });
  assert.equal(first.status, 200); assert.equal(first.body.orders.length, 2); assert.equal(first.body.pagination.hasMore, true);
  const second = await request(`/api/orders?limit=2&cursor=${first.body.pagination.nextCursor}`, { auth: token(a.user) });
  assert.equal(second.body.orders.length, 1); assert.equal(second.body.pagination.hasMore, false);
  assert.equal(new Set([...first.body.orders, ...second.body.orders].map(o => o.id)).size, 3);
  assert.equal((await request('/api/orders?cursor=bad', { auth: token(a.user) })).status, 400);
  assert.equal((await request('/api/orders?limit=999', { auth: token(a.user) })).body.pagination.limit, 100);
  assert.equal((await request('/api/orders?limit=-1', { auth: token(a.user) })).body.pagination.limit, 30);
  assert.deepEqual(db.queries.find(q => q.operation === 'findMany').orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
});

test('Tenant isolation: cross-tenant read/update/pay and public order/menu combinations fail', async () => {
  const foreign = (await order(b)).body.order.id;
  const auth = token(a.user);
  assert.equal((await request(`/api/orders/${foreign}?restaurantId=${b.restaurant.id}`, { auth })).status, 404);
  assert.equal((await request(`/api/orders/${foreign}/status`, { method: 'PATCH', auth, body: { status: 'PREPARING', restaurantId: b.restaurant.id } })).status, 400);
  assert.equal((await request(`/api/orders/${foreign}/pay`, { method: 'POST', auth, body: { paymentMethod: 'CASH', restaurantId: b.restaurant.id } })).status, 400);
  assert.equal((await order(a, { existingOrderId: foreign })).status, 404);
  assert.equal((await order(a, { items: [{ menuItemId: b.menu.id, quantity: 1 }] })).status, 400);
  assert.equal((await order(a, { tableNumber: 'missing' })).status, 404);
  assert.equal(db.data.payments.length, 0); assert.equal(db.data.orders[0].status, 'NEW');
});

test('Tenant isolation: forged signed claims cannot override DB tenant/role', async () => {
  await order(a); await order(b);
  const forged = jwt.sign({ id: a.user.id, restaurantId: b.restaurant.id, role: 'SUPER_ADMIN' }, process.env.JWT_SECRET);
  const response = await request(`/api/orders?restaurantId=${b.restaurant.id}`, { auth: forged });
  assert.equal(response.status, 200);
  assert.ok(response.body.orders.every(o => o.restaurantId === a.restaurant.id));
  const { resolveAccessToken } = require('../dist/middlewares/auth.middleware');
  const identity = await resolveAccessToken(forged);
  assert.equal(identity.role, 'RESTAURANT_OWNER'); assert.equal(identity.restaurantId, a.restaurant.id);
  a.user.restaurantId = null;
  assert.equal((await resolveAccessToken(forged)).restaurantId, a.restaurant.id);
  a.restaurant.isActive = false;
  assert.equal((await request('/api/orders', { auth: forged })).status, 400);
});

test('Tenant isolation: real Socket.IO handshake rejects bad auth and only joins trusted tenant room', async () => {
  async function packet(route, body) {
    const response = await fetch(`${base}${route}`, {
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    assert.ok(require('../dist/lib/request-context').sanitizeRequestId(response.headers.get('x-request-id')));
    return response.text();
  }
  for (const auth of [{}, { token: 'invalid' }, { token: jwt.sign({ id: a.user.id, restaurantId: b.restaurant.id, role: 'SUPER_ADMIN' }, process.env.JWT_SECRET) }]) {
    const opening = await packet('/socket.io/?EIO=4&transport=polling');
    assert.ok(opening.startsWith('0'));
    const route = `/socket.io/?EIO=4&transport=polling&sid=${JSON.parse(opening.slice(1)).sid}`;
    try {
      await packet(route, `40${JSON.stringify(auth)}`);
      const connected = await packet(route);
      if (!auth.token || auth.token === 'invalid') {
        assert.ok(connected.startsWith('44'), 'Handshake must reject unauthorized client');
      } else {
        assert.ok(connected.startsWith('40'), 'Valid identity connects');
        const socket = io.of('/').sockets.get(JSON.parse(connected.slice(2)).sid);
        assert.ok(socket.rooms.has(a.restaurant.id)); assert.equal(socket.rooms.has(b.restaurant.id), false);
        await packet(route, `42${JSON.stringify(['join', b.restaurant.id])}`);
        assert.equal(socket.rooms.has(b.restaurant.id), false);
        assert.equal(socket.data.user.role, 'RESTAURANT_OWNER');
      }
    } finally { await packet(route, '1'); }
  }
});

test('Tracing: Socket.IO preflight and WebSocket upgrade carry IDs', { timeout: 5000 }, async () => {
  const { sanitizeRequestId } = require('../dist/lib/request-context');
  const res = await fetch(`${base}/socket.io/?EIO=4&transport=polling`, {
    method: 'OPTIONS', headers: { Origin: process.env.FRONTEND_URL, 'Access-Control-Request-Method': 'GET' },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(res.status, 204); assert.ok(sanitizeRequestId(res.headers.get('x-request-id')));
  assert.equal(res.headers.get('access-control-allow-origin'), process.env.FRONTEND_URL);
  const WebSocket = require('ws');
  const ws = new WebSocket(`${base.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`);
  try {
    const [[upgrade], [opening]] = await Promise.all([once(ws, 'upgrade'), once(ws, 'message')]);
    assert.ok(sanitizeRequestId(upgrade.headers['x-request-id']));
    assert.ok(opening.toString().startsWith('0'));
  } finally { ws.terminate(); }
});

test('Inventory/payments: HTTP settlement enqueues correct IDs once; replay creates no second payment', async t => {
  const { LuaStore } = require('./support/lua-store.cjs');
  const store = new LuaStore();
  const handled = [];
  const traced = [];
  const queue = new DurableDeductionQueue(async () => store, async job => { handled.push([job.orderId, job.restaurantId]); traced.push(job.requestId); },
    { maxAttempts: 5, baseDelayMs: 1000, lockSeconds: 300, batchSize: 25, autoStart: false });
  t.mock.method(DeductionQueueService, 'enqueueDeduction', (id, restaurantId) => queue.enqueue(id, restaurantId));
  const id = (await order()).body.order.id;
  const payments = [];
  for (let i = 0; i < 2; i++) {
    const paid = await request(`/api/orders/${id}/pay`, { method: 'POST', auth: token(a.user), body: { paymentMethod: 'CASH' } });
    assert.equal(paid.status, 200); payments.push(paid.requestId);
  }
  await queue.drain(); await queue.drain();
  assert.deepEqual(handled, [[id, a.restaurant.id]]);
  assert.deepEqual(traced, [payments[0]]);
  assert.equal(db.data.payments.length, 1); assert.equal(db.data.transactions.length, 1);
  assert.equal(db.data.payments[0].amount, 220);
  assert.equal(db.data.payments[0].restaurantId, a.restaurant.id);
  assert.equal((await request(`/api/orders/${id}/pay`, { method: 'POST', body: {} })).status, 401);
});

test('Payments: legacy public simulator is blocked without writes', async () => {
  const id = (await order()).body.order.id;
  for (const slug of [a.restaurant.slug, b.restaurant.slug]) {
    assert.equal((await request(`/api/public/${slug}/orders/${id}/pay-mock`, { method: 'POST', body: {} })).status, 410);
  }
  assert.equal(db.data.payments.length, 0);
  assert.equal(db.data.transactions.length, 0);
});
test('Tracing: health/readiness and protected CRM cron retain the HTTP ID in logs', async t => {
  const logs = []; t.mock.method(console, 'info', row => logs.push(row));
  const { getRequestId } = require('../dist/lib/request-context');
  const { logStructured } = require('../dist/lib/safe-error');
  const { CRMScheduler } = require('../dist/services/crm/scheduler.service');
  t.mock.method(require('../dist/services/health.service'), 'checkReadiness', async () => ({
    status: 'healthy', dependencies: { database: 'healthy', redis: 'healthy' },
  }));
  let cronId;
  t.mock.method(CRMScheduler, 'runCycle', async () => {
    await Promise.resolve(); cronId = getRequestId();
    logStructured('info', 'crm', 'test.cron', 'completed', 'Cron context retained');
    return 'completed';
  });
  for (const route of ['/health', '/ready']) {
    const res = await request(route); assert.equal(res.status, 200);
    assert.ok(logs.some(row => row.stage === 'request.complete' && row.requestId === res.requestId));
  }
  assert.equal((await request('/api/internal/cron/crm')).status, 401);
  assert.equal(cronId, undefined);
  const res = await request('/api/internal/cron/crm', { auth: process.env.CRON_SECRET });
  assert.equal(res.status, 200); assert.equal(cronId, res.requestId);
  assert.ok(logs.some(row => row.stage === 'test.cron' && row.requestId === res.requestId));
});

test.todo('UNAVAILABLE Payments: real provider verification and signed webhooks require an integration');
test.todo('DEFERRED Payments: atomic payment-to-queue handoff across process crashes');
test.todo('UNVERIFIED Database: real PostgreSQL constraints, RLS and transaction isolation');
