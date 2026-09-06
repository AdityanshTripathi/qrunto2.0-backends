'use strict';
require('./support/isolation.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { violations } = require('./support/isolation.cjs');
const legacy = require('../dist/scripts/test-inventory-deduction-queue');
const { LuaStore } = require('./support/lua-store.cjs');
const { DurableDeductionQueue } = require('../dist/services/inventory/durable-deduction-queue');
const options = { maxAttempts: 5, baseDelayMs: 1000, lockSeconds: 300, batchSize: 25, autoStart: false };
const READY = 'inventory:deduction:ready', PROCESSING = 'inventory:deduction:processing';
after(() => assert.equal(violations.length, 0));
for (const [name, fn] of [
  ['order service forwards tenant/order IDs', legacy.orderToQueueIntegration],
  ['ledger idempotency deducts stock once', legacy.exactlyOnceDeduction],
  ['duplicate enqueue is rejected', legacy.successAndDuplicate],
  ['restart recovers processing jobs', legacy.restartRecovery],
  ['disconnect at claim/lock/ack/release recovers without recurring errors', legacy.reconnectRecovery],
]) test(`Inventory: ${name}`, fn);

test('Background jobs: exact exponential backoff, no early retries, bounded DLQ and audit', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const store = new LuaStore(); let calls = 0, audits = 0;
  const queue = new DurableDeductionQueue(async () => store, async () => { calls++; throw new Error('synthetic failure'); }, options, async () => { audits++; });
  await queue.enqueue('failed', 'tenant');
  for (const [index, delay] of [1000, 2000, 4000, 8000].entries()) {
    await queue.drain();
    const job = JSON.parse(store.lists.get(READY)[0]);
    assert.equal(job.attempts, index + 1); assert.equal(job.notBefore - Date.now(), delay);
    t.mock.timers.tick(delay - 1); await queue.drain(); assert.equal(calls, index + 1);
    t.mock.timers.tick(1);
  }
  await queue.drain(); await queue.drain();
  assert.equal(calls, 5); assert.equal(audits, 1);
  assert.deepEqual(await queue.getStatus(), { ready: 0, processing: 0, deadLetter: 1, success: 0, failures: 5, retries: 4 });
});

test('Background jobs: transient failure retries once and successful job never repeats', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const store = new LuaStore(); let calls = 0;
  const queue = new DurableDeductionQueue(async () => store, async () => { if (++calls === 1) throw new Error('synthetic transient'); }, options);
  await queue.enqueue('retry', 'tenant'); await queue.drain();
  t.mock.timers.tick(1000); await queue.drain(); await queue.drain();
  assert.equal(calls, 2); assert.equal(await queue.enqueue('retry', 'tenant'), false);
  assert.deepEqual(await queue.getStatus(), { ready: 0, processing: 0, deadLetter: 0, success: 1, failures: 1, retries: 1 });
});

test('Background jobs: competing workers cannot run a locked job twice', async () => {
  const store = new LuaStore(); let calls = 0, entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const handler = async () => { calls++; entered(); await gate; };
  const first = new DurableDeductionQueue(async () => store, handler, options);
  const second = new DurableDeductionQueue(async () => store, handler, options);
  await first.enqueue('contended', 'tenant');
  const running = first.drain(); await started;
  try { await second.drain(); assert.equal(calls, 1); }
  finally { release(); await running; }
  await second.drain(); assert.equal(calls, 1);
});

test('Redis locks: restart waits for old lock expiry and stale owner cannot release replacement lock', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const store = new LuaStore(); let calls = 0;
  const queue = new DurableDeductionQueue(async () => store, async () => { calls++; }, options);
  await queue.enqueue('locked', 'tenant'); await store.lMove(READY, PROCESSING);
  const lock = 'inventory:deduction:lock:tenant:locked';
  await store.set(lock, 'old-worker', { NX: true, EX: 300 });
  await queue.drain(); assert.equal(calls, 0);
  t.mock.timers.tick(300000); await queue.drain(); assert.equal(calls, 1);
  const replacement = new DurableDeductionQueue(async () => store, async () => { await store.set('inventory:deduction:lock:tenant:replacement', 'new-owner', { EX: 300 }); }, options);
  await replacement.enqueue('replacement', 'tenant'); await replacement.drain();
  assert.equal(await store.get('inventory:deduction:lock:tenant:replacement'), 'new-owner');
});

test('Background jobs: malformed payload dead-letters without invoking handler', async () => {
  const store = new LuaStore(); let calls = 0;
  const queue = new DurableDeductionQueue(async () => store, async () => { calls++; }, options);
  await store.rPush(READY, 'invalid-json'); await queue.drain();
  assert.equal(calls, 0); assert.equal((await queue.getStatus()).deadLetter, 1);
});
