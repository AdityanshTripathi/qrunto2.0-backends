'use strict';
const { violations } = require('./support/isolation.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const express = require('express');
const cors = require('cors');
const { requestIdMiddleware } = require('../dist/middlewares/request-id.middleware');
const { getRequestId, sanitizeRequestId, withRequestId } = require('../dist/lib/request-context');
const { logStructured, logSafeError } = require('../dist/lib/safe-error');
const { corsOptions } = require('../dist/config/cors');
const { DurableDeductionQueue } = require('../dist/services/inventory/durable-deduction-queue');
const { LuaStore } = require('./support/lua-store.cjs');
const app = express(); app.use(requestIdMiddleware); app.use(cors(corsOptions));
app.get('/', async (_req, res) => {
  await Promise.resolve();
  logStructured('info', 'test', 'trace.context', 'completed', 'Context retained');
  res.json({ requestId: getRequestId(), localId: res.locals.requestId });
});
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.equal(violations.length, 0); });

test('Tracing: generated, accepted and rejected IDs match response, async context and logs', async t => {
  const logs = []; t.mock.method(console, 'info', row => logs.push(row));
  const accepted = randomUUID().toUpperCase();
  const generated = new Set();
  for (const candidate of [undefined, accepted, 'invalid', 'x'.repeat(1000), 'test@example.test', 'Bearer synthetic-token', `${accepted},${accepted}`]) {
    const res = await fetch(base, { headers: candidate ? { 'X-Request-ID': candidate } : {}, signal: AbortSignal.timeout(5000) });
    const id = res.headers.get('x-request-id');
    assert.equal(sanitizeRequestId(id), id);
    assert.deepEqual(await res.json(), { requestId: id, localId: id });
    if (candidate === accepted) assert.equal(id, accepted.toLowerCase());
    else { assert.notEqual(id, candidate); assert.ok(!generated.has(id)); generated.add(id); }
    assert.equal(logs.filter(row => row.requestId === id && row.stage === 'request.complete').length, 1);
    assert.equal(logs.filter(row => row.requestId === id && row.stage === 'trace.context').length, 1);
  }
  for (const invalid of ['x\r\nInjected: value', '\0', [accepted], null, '']) assert.equal(sanitizeRequestId(invalid), undefined);
  assert.equal(getRequestId(), undefined);
  assert.ok(!JSON.stringify(logs).includes('synthetic-token'));
});

test('Tracing: concurrent requests remain isolated and CORS exposes/permits ID header', async () => {
  const ids = Array.from({ length: 8 }, () => randomUUID());
  await Promise.all(ids.map(async id => {
    const res = await fetch(base, { headers: { 'X-Request-ID': id }, signal: AbortSignal.timeout(5000) });
    assert.equal((await res.json()).requestId, id);
  }));
  const res = await fetch(base, { method: 'OPTIONS', headers: {
    Origin: process.env.FRONTEND_URL, 'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization,x-request-id',
  }, signal: AbortSignal.timeout(5000) });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-headers'), /Authorization.*X-Request-ID/i);
  assert.match(res.headers.get('access-control-expose-headers'), /X-Request-ID/i);
  assert.ok(sanitizeRequestId(res.headers.get('x-request-id')));
});

test('Tracing: safe errors retain redaction and cannot override trusted context ID', async t => {
  const logs = []; t.mock.method(console, 'error', row => logs.push(row));
  const id = randomUUID();
  await withRequestId(id, async () => {
    await Promise.resolve();
    logSafeError('test.failure', new Error('Bearer synthetic-secret'), 'test', { requestId: 'untrusted' });
  });
  assert.equal(logs[0].requestId, id);
  assert.ok(!JSON.stringify(logs).includes('synthetic-secret'));
});

test('Tracing: durable correlation survives retry, restart, recovery and dead-letter', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const logs = []; t.mock.method(console, 'error', row => logs.push(row));
  const store = new LuaStore(), id = randomUUID(), seen = [];
  const options = { maxAttempts: 2, baseDelayMs: 1000, lockSeconds: 300, batchSize: 25, autoStart: false };
  const handler = async job => { seen.push(getRequestId()); assert.equal(job.requestId, id); throw new Error('synthetic failure'); };
  const first = new DurableDeductionQueue(async () => store, handler, options);
  await withRequestId(id, () => first.enqueue('traced-order', 'test-tenant'));
  assert.equal(await first.enqueue('traced-order', 'test-tenant'), false);
  await first.drain();
  assert.equal(JSON.parse(store.lists.get('inventory:deduction:ready')[0]).requestId, id);
  await store.lMove('inventory:deduction:ready', 'inventory:deduction:processing');
  t.mock.timers.tick(1000);
  const restarted = new DurableDeductionQueue(async () => store, handler, options);
  await withRequestId(randomUUID(), () => restarted.drain());
  assert.deepEqual(seen, [id, id]);
  assert.equal(JSON.parse(store.lists.get('inventory:deduction:dead')[0]).requestId, id);
  assert.ok(logs.some(row => row.stage.endsWith('.retry') && row.requestId === id));
  assert.ok(logs.some(row => row.stage.endsWith('.dead-letter') && row.requestId === id));
});

test('Tracing: legacy and standalone jobs receive safe IDs', async () => {
  const store = new LuaStore(), seen = [];
  const options = { maxAttempts: 2, baseDelayMs: 1000, lockSeconds: 300, batchSize: 25, autoStart: false };
  await store.rPush('inventory:deduction:ready', JSON.stringify({ orderId: 'legacy', restaurantId: 'test', attempts: 0, notBefore: 0 }));
  const queue = new DurableDeductionQueue(async () => store, async job => { assert.equal(job.requestId, getRequestId()); seen.push(job.requestId); }, options);
  await queue.enqueue('standalone', 'test'); await queue.drain();
  assert.equal(seen.length, 2); assert.ok(seen.every(id => sanitizeRequestId(id))); assert.notEqual(seen[0], seen[1]);
});
