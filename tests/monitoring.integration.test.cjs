'use strict';
const { violations } = require('./support/isolation.cjs');
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { MonitoringMetrics, monitoringMetrics, WINDOW_MS } = require('../dist/lib/monitoring-metrics');
const { alertConditions, boundedProbe } = require('../dist/services/monitoring.service');
const { withRequestId } = require('../dist/lib/request-context');
const { logSafeError } = require('../dist/lib/safe-error');
const healthy = { status: 'healthy', dependencies: { database: 'healthy', redis: 'healthy' } };
const queue = { running: false, ready: 0, processing: 0, success: 2, failures: 0, retries: 0, deadLetter: 0 };
after(() => assert.equal(violations.length, 0));

test('Monitoring: readiness, Redis and durable dead-letter alert conditions', () => {
  const recent = new MonitoringMetrics().snapshot();
  assert.deepEqual(alertConditions(healthy, queue, queue, recent), []);
  const degraded = { status: 'degraded', dependencies: { database: 'healthy', redis: 'unhealthy' } };
  assert.deepEqual(alertConditions(degraded, queue, queue, recent), ['READINESS_UNHEALTHY', 'REDIS_UNAVAILABLE']);
  assert.deepEqual(alertConditions(healthy, { deadLetter: 1 }, { deadLetter: 1 }, recent), ['CRM_DEAD_LETTER', 'INVENTORY_DEAD_LETTER']);
  assert.ok(alertConditions(null, null, null, recent).includes('QUEUE_STATUS_UNAVAILABLE'));
});

test('Monitoring: exact 5xx, latency and repeated failure thresholds expire without sleeps', () => {
  const metrics = new MonitoringMetrics(), now = 1_000_000;
  for (let i = 0; i < 19; i++) metrics.request(i < 4 ? 500 : 200, i < 9 ? 2000 : 1999, now);
  let recent = metrics.snapshot(now);
  assert.equal(recent.errors5xx, 4); assert.equal(recent.slow, 9);
  assert.deepEqual(alertConditions(healthy, queue, queue, recent), []);
  metrics.request(503, 2000, now);
  for (let i = 0; i < 3; i++) {
    metrics.failure('redis', 'connection', now);
    metrics.failure('crm', 'jobs.campaigns.retry', now);
    metrics.failure('crm', 'cron.cycle', now); // same failure wrapper must not count twice
    metrics.failure('inventory', 'inventory.deduction.dead-letter', now);
  }
  recent = metrics.snapshot(now);
  assert.equal(recent.crmFailures, 3);
  assert.deepEqual(alertConditions(healthy, queue, queue, recent), [
    'REDIS_REPEATED_FAILURE', 'CRM_REPEATED_FAILURE', 'INVENTORY_REPEATED_FAILURE', 'HTTP_5XX_SPIKE', 'HTTP_HIGH_LATENCY',
  ]);
  assert.equal(metrics.snapshot(now + WINDOW_MS).requests, 0);
  assert.deepEqual(alertConditions(healthy, queue, queue, metrics.snapshot(now + WINDOW_MS)), []);
});

test('Monitoring: stalled probes time out, share work, and recover', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, release;
  const probe = boundedProbe(() => { calls++; return new Promise(resolve => { release = resolve; }); }, 100);
  const first = probe(), second = probe(); await Promise.resolve();
  t.mock.timers.tick(100);
  assert.deepEqual(await Promise.all([first, second]), [null, null]); assert.equal(calls, 1);
  const third = probe(); t.mock.timers.tick(100); assert.equal(await third, null); assert.equal(calls, 1);
  release('healthy'); await Promise.resolve(); await Promise.resolve();
  const fourth = probe(); await Promise.resolve(); release('healthy');
  assert.equal(await fourth, 'healthy'); assert.equal(calls, 2);
});

test('Monitoring: Redis error/recovery signals reuse one client and redact exceptions', async t => {
  const { SharedRedis } = require('../dist/lib/redis');
  const logs = []; t.mock.method(console, 'error', row => logs.push(row)); t.mock.method(console, 'info', row => logs.push(row));
  const old = process.env.REDIS_URL; process.env.REDIS_URL = 'redis://127.0.0.1:1';
  t.after(() => { if (old === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = old; });
  const client = new EventEmitter(); client.isReady = true; let factories = 0;
  const shared = new SharedRedis(() => { factories++; return client; });
  await shared.commands();
  const id = randomUUID();
  await withRequestId(id, async () => {
    client.emit('error', Object.assign(new Error('synthetic-password'), { code: 'ECONNRESET' }));
    client.emit('reconnecting'); client.emit('ready'); client.emit('ready');
  });
  await shared.commands(); assert.equal(factories, 1);
  assert.equal(logs.filter(row => row.stage === 'connection.recovered').length, 1);
  assert.ok(logs.every(row => row.requestId === id));
  assert.ok(!JSON.stringify(logs).includes('synthetic-password'));
});

const { app, server, io } = require('../dist/server');
let base;
before(async () => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => io.close(resolve)); });

test('Monitoring: protected endpoint, safe projections, degraded response and recovery logs', async t => {
  const logs = []; t.mock.method(console, 'info', row => logs.push(row)); t.mock.method(console, 'error', row => logs.push(row));
  let calls = 0, dead = 0;
  t.mock.method(require('../dist/services/health.service'), 'checkReadiness', async () => { calls++; return healthy; });
  t.mock.method(require('../dist/services/crm/scheduler.service').CRMScheduler, 'getStatus', async () => ({ ...queue, deadLetter: dead, token: 'synthetic-private-value' }));
  t.mock.method(require('../dist/services/inventory/deduction-queue.service').DeductionQueueService, 'getStatus', async () => queue);
  const route = `${base}/api/internal/cron/crm/monitoring`;
  for (const auth of [undefined, 'Bearer invalid']) {
    const res = await fetch(route, { headers: auth ? { Authorization: auth } : {}, signal: AbortSignal.timeout(5000) });
    assert.equal(res.status, 401); await res.arrayBuffer();
  }
  assert.equal(calls, 0);
  const secret = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
  try { const res = await fetch(route); assert.equal(res.status, 503); await res.arrayBuffer(); }
  finally { process.env.CRON_SECRET = secret; }
  const request = () => fetch(route, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000) });
  let res = await request(); assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json(); assert.equal(body.recent.scope, 'process-local'); assert.equal(body.crm.success, 2);
  assert.ok(!JSON.stringify(body).includes('synthetic-private-value')); assert.ok(!JSON.stringify(body).includes(secret));
  dead = 1;
  res = await request(); assert.equal(res.status, 503); assert.deepEqual((await res.json()).alerts, ['CRM_DEAD_LETTER']);
  res = await request(); await res.arrayBuffer();
  assert.equal(logs.filter(row => row.stage === 'alerts.transition' && row.status === 'alerting').length, 1);
  dead = 0; res = await request(); assert.equal(res.status, 200); await res.arrayBuffer();
  assert.ok(logs.some(row => row.stage === 'alerts.transition' && row.status === 'recovered'));
});

test('Monitoring: real HTTP 5xx increments once; health/internal probes excluded', async t => {
  const logs = []; t.mock.method(console, 'error', row => logs.push(row));
  app.get('/api/monitoring-test-only', (_req, res) => res.status(500).json({ error: 'synthetic' }));
  t.mock.method(require('../dist/services/health.service'), 'checkReadiness', async () => ({
    status: 'degraded', dependencies: { database: 'healthy', redis: 'unhealthy' },
  }));
  const before = monitoringMetrics.snapshot().errors5xx;
  const res = await fetch(`${base}/api/monitoring-test-only`); assert.equal(res.status, 500); await res.arrayBuffer();
  const ready = await fetch(`${base}/ready`); assert.equal(ready.status, 503); await ready.arrayBuffer();
  assert.equal(monitoringMetrics.snapshot().errors5xx, before + 1);
  assert.ok(logs.some(row => row.code === 'READINESS_UNHEALTHY' && row.requestId === ready.headers.get('x-request-id')));
});

test('Monitoring: fatal observer is idempotent, safe and preserves crash handlers', t => {
  const { installProcessMonitoring } = require('../dist/lib/process-monitoring');
  const before = process.listenerCount('uncaughtException');
  const count = process.listenerCount('uncaughtExceptionMonitor');
  installProcessMonitoring(); installProcessMonitoring();
  assert.equal(process.listenerCount('uncaughtExceptionMonitor'), count);
  assert.equal(process.listenerCount('uncaughtException'), before);
  const logs = []; t.mock.method(console, 'error', row => logs.push(row));
  // Call our observer directly: do not crash the test process or invoke runner listeners.
  const observer = process.listeners('uncaughtExceptionMonitor').at(-1);
  observer(new Error('synthetic-sensitive-message'), 'uncaughtException');
  observer(new Error('synthetic-sensitive-message'), 'unhandledRejection');
  assert.deepEqual(logs.map(row => row.stage), ['uncaught-exception', 'unhandled-rejection']);
  assert.ok(logs.every(row => row.service === 'process' && row.level === 'error'));
  assert.ok(!JSON.stringify(logs).includes('synthetic-sensitive-message'));
});

test('Monitoring: real fatal exception and rejection still terminate child processes', () => {
  const { spawnSync } = require('node:child_process');
  for (const [action, stage] of [
    ["throw new Error('synthetic crash')", 'uncaught-exception'],
    ["Promise.reject(new Error('synthetic crash'))", 'unhandled-rejection'],
  ]) {
    const code = `console.error = row => process.stdout.write(JSON.stringify(row) + '\\n'); require('./dist/lib/process-monitoring').installProcessMonitoring(); ${action}`;
    const result = spawnSync(process.execPath, ['--unhandled-rejections=throw', '-e', code], {
      cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    });
    assert.equal(result.status, 1);
    const record = JSON.parse(result.stdout.trim());
    assert.equal(record.stage, stage); assert.equal(record.service, 'process');
    assert.equal(record.code, 'UNKNOWN'); assert.ok(!record.message.includes('synthetic crash'));
  }
});
