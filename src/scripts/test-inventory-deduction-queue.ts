import 'dotenv/config';
import assert from 'node:assert/strict';
import { DeductionJob, DurableDeductionQueue, QueueStore } from '../services/inventory/durable-deduction-queue';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { OrderService } from '../services/order.service';
import { DeductionQueueService } from '../services/inventory/deduction-queue.service';

export class FakeStore implements QueueStore {
  readonly strings = new Map<string, string>();
  readonly lists = new Map<string, string[]>();
  readonly expires = new Map<string, number>();

  async eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<number> {
    if (script.includes('inventory-enqueue')) {
      if (this.strings.has(options.keys[0]!)) return 0;
      this.strings.set(options.keys[0]!, 'queued');
      await this.rPush(options.keys[1]!, options.arguments[0]!);
      return 1;
    }
    if (script.includes('inventory-dead-letter')) {
      this.strings.set(options.keys[0]!, 'failed');
      await this.rPush(options.keys[1]!, options.arguments[0]!);
      await this.lRem(options.keys[2]!, 1, options.arguments[1]!);
      return 1;
    }
    if (this.strings.get(options.keys[0]!) === options.arguments[0]) {
      this.strings.delete(options.keys[0]!);
      return 1;
    }
    return 0;
  }

  async get(key: string): Promise<string | null> {
    if ((this.expires.get(key) ?? Infinity) <= Date.now()) {
      this.strings.delete(key);
      this.expires.delete(key);
    }
    return this.strings.get(key) ?? null;
  }
  async set(key: string, value: string, options?: { NX?: boolean; EX?: number }): Promise<string | null> {
    if (options?.NX && this.strings.has(key) && (this.expires.get(key) ?? Infinity) > Date.now()) return null;
    this.strings.set(key, value);
    if (options?.EX) this.expires.set(key, Date.now() + options.EX * 1000);
    else this.expires.delete(key);
    return 'OK';
  }
  async lMove(source: string, destination: string): Promise<string | null> {
    const raw = this.list(source).shift() ?? null;
    if (raw) this.list(destination).push(raw);
    return raw;
  }
  async rPush(key: string, value: string): Promise<number> { return this.list(key).push(value); }
  async lLen(key: string): Promise<number> { return this.list(key).length; }
  async incr(key: string): Promise<number> {
    const value = Number(this.strings.get(key) || 0) + 1;
    this.strings.set(key, String(value));
    return value;
  }
  async lRem(key: string, count: number, value: string): Promise<number> {
    const list = this.list(key);
    const index = list.indexOf(value);
    if (index < 0) return 0;
    list.splice(index, count || 1);
    return 1;
  }
  private list(key: string): string[] {
    const list = this.lists.get(key) ?? [];
    this.lists.set(key, list);
    return list;
  }
}

const options = { maxAttempts: 3, baseDelayMs: 1, lockSeconds: 5, batchSize: 25, autoStart: false };
const key = (restaurant: string, order: string) => `inventory:deduction:job:${restaurant}:${order}`;

async function successAndDuplicate(): Promise<void> {
  const store = new FakeStore();
  let calls = 0;
  const queue = new DurableDeductionQueue(async () => store, async () => { calls++; }, options);
  assert.equal(await queue.enqueue('o1', 'r1'), true);
  assert.equal(await queue.enqueue('o1', 'r1'), false);
  await queue.drain();
  assert.equal(calls, 1);
  assert.equal(await store.get(key('r1', 'o1')), 'done');
}

async function orderToQueueIntegration(): Promise<void> {
  const mutablePrisma = prisma as unknown as { $transaction: (callback: (tx: any) => Promise<any>) => Promise<any> };
  const originalTransaction = mutablePrisma.$transaction;
  const originalEnqueue = DeductionQueueService.enqueueDeduction;
  const jobs: Array<[string, string]> = [];
  let reads = 0;
  const tx = {
    order: {
      findFirst: async () => ({ id: 'order-1', status: reads++ ? OrderStatus.PAID : OrderStatus.READY, customerId: null, totalAmount: 100 }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  mutablePrisma.$transaction = async callback => callback(tx);
  DeductionQueueService.enqueueDeduction = async (orderId, restaurantId) => { jobs.push([orderId, restaurantId]); };
  try {
    await new OrderService().updateOrderStatus('order-1', 'restaurant-1', OrderStatus.PAID);
    assert.deepEqual(jobs, [['order-1', 'restaurant-1']]);
  } finally {
    mutablePrisma.$transaction = originalTransaction;
    DeductionQueueService.enqueueDeduction = originalEnqueue;
  }
}

async function exactlyOnceDeduction(): Promise<void> {
  const mutablePrisma = prisma as unknown as { $transaction: (callback: (tx: any) => Promise<any>) => Promise<any> };
  const originalTransaction = mutablePrisma.$transaction;
  let stock = 10;
  let ledgerCreated = false;
  let ledgerWrites = 0;
  const order = {
    id: 'order-2', orderNumber: 2,
    orderItems: [{
      id: 'item-1', quantity: 2, itemName: 'Dish',
      menuItem: { recipe: { ingredients: [{ quantity: 500, rawMaterialId: 'material-1' }] } },
    }],
  };
  const tx = {
    order: { findFirst: async () => order },
    rawMaterial: {
      findFirst: async () => ({ id: 'material-1', unit: 'KG', currentStock: stock }),
      update: async ({ data }: any) => { stock = data.currentStock; },
    },
    stockLedger: {
      findFirst: async () => ledgerCreated ? { id: 'ledger-1' } : null,
      create: async () => { ledgerCreated = true; ledgerWrites++; },
    },
    auditLog: { create: async () => undefined },
  };
  mutablePrisma.$transaction = async callback => callback(tx);
  const service = DeductionQueueService as unknown as {
    deductStockForOrder: (orderId: string, restaurantId: string) => Promise<void>;
  };
  try {
    await service.deductStockForOrder('order-2', 'restaurant-2');
    await service.deductStockForOrder('order-2', 'restaurant-2');
    assert.equal(stock, 9);
    assert.equal(ledgerWrites, 1);
  } finally {
    mutablePrisma.$transaction = originalTransaction;
  }
}

async function transientRetry(): Promise<void> {
  const store = new FakeStore();
  let calls = 0;
  const queue = new DurableDeductionQueue(async () => store, async () => {
    if (++calls === 1) throw new Error('transient');
  }, options);
  await queue.enqueue('o2', 'r1');
  await queue.drain();
  assert.equal(store.lists.get('inventory:deduction:ready')?.length, 1);
  assert.equal(store.lists.get('inventory:deduction:processing')?.length, 0);
  await new Promise(resolve => setTimeout(resolve, 3));
  await queue.drain();
  assert.equal(calls, 2);
  assert.equal(await store.get(key('r1', 'o2')), 'done');
}

async function deadLetterAndMonitoring(): Promise<void> {
  const store = new FakeStore();
  const queue = new DurableDeductionQueue(async () => store, async () => {
    throw new Error('permanent test failure');
  }, options);
  await queue.enqueue('o-dead', 'r1');
  for (const delay of [0, 2, 3]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    await queue.drain();
  }
  assert.deepEqual(await queue.getStatus(), {
    ready: 0, processing: 0, deadLetter: 1, success: 0, failures: 3, retries: 2,
  });
}

async function restartRecovery(): Promise<void> {
  const store = new FakeStore();
  let calls = 0;
  const stopped = new DurableDeductionQueue(async () => store, async () => {}, options);
  await stopped.enqueue('o3', 'r2');
  await store.lMove('inventory:deduction:ready', 'inventory:deduction:processing');
  const restarted = new DurableDeductionQueue(async () => store, async () => { calls++; }, options);
  await restarted.drain();
  assert.equal(calls, 1);
  assert.equal(await store.get(key('r2', 'o3')), 'done');
}

async function multiWorkerContention(): Promise<void> {
  const store = new FakeStore();
  let calls = 0;
  const handler = async (_job: DeductionJob) => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 3));
  };
  const first = new DurableDeductionQueue(async () => store, handler, options);
  const second = new DurableDeductionQueue(async () => store, handler, options);
  await first.enqueue('o4', 'r2');
  const raw = store.lists.get('inventory:deduction:ready')![0]!;
  await store.rPush('inventory:deduction:ready', raw);
  await Promise.all([first.drain(), second.drain()]);
  await first.drain();
  assert.equal(calls, 1);
}

async function reconnectRecovery(): Promise<void> {
  // Model disconnects before/after a claim, during lock acquisition, and after
  // a successful deduction but before Redis acknowledges completion.
  for (const failurePoint of ['claim', 'claim-response', 'lock', 'ack', 'release']) {
    const store = new FakeStore();
    let disconnected = false;
    let injected = false;
    let effects = 0;
    const applied = new Set<string>();
    const connectionError = () => Object.assign(new Error('private-redis-detail'), { code: 'ECONNRESET' });
    const guarded = new Proxy(store, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (typeof value !== 'function') return value;
        return async (...args: any[]) => {
          if (disconnected) throw connectionError();
          const matches = (failurePoint.startsWith('claim') && property === 'lMove' && args[0] === 'inventory:deduction:ready')
            || (failurePoint === 'lock' && property === 'set' && args[0].includes(':lock:'))
            || (failurePoint === 'ack' && property === 'set' && args[1] === 'done')
            || (failurePoint === 'release' && property === 'eval' && args[0].includes('inventory-lock-release'));
          if (!injected && matches) {
            injected = disconnected = true;
            if (failurePoint === 'claim-response') await value.apply(target, args);
            throw connectionError();
          }
          return value.apply(target, args);
        };
      },
    }) as QueueStore;
    const queue = new DurableDeductionQueue(async () => {
      if (disconnected) throw connectionError();
      return guarded;
    }, async job => {
      if (!applied.has(job.orderId)) { applied.add(job.orderId); effects++; }
    }, options);
    await queue.enqueue('reconnect', 'r1');
    await queue.drain();
    assert.ok(injected);
    disconnected = false;
    // Simulate expiry of a lock whose release was interrupted.
    store.strings.delete('inventory:deduction:lock:r1:reconnect');
    await queue.drain();
    assert.equal(await store.get(key('r1', 'reconnect')), 'done', failurePoint);
    assert.equal(effects, 1, failurePoint);
    assert.equal(await store.lLen('inventory:deduction:processing'), 0, failurePoint);
    assert.equal(await store.lLen('inventory:deduction:dead'), 0, failurePoint);
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args) => { errors.push(args); };
    try { for (let i = 0; i < 3; i++) await queue.drain(); }
    finally { console.error = originalError; }
    assert.equal(errors.length, 0, 'No recurring failures after reconnect');
  }
}

async function main(): Promise<void> {
  await orderToQueueIntegration();
  await exactlyOnceDeduction();
  await successAndDuplicate();
  await transientRetry();
  await deadLetterAndMonitoring();
  await restartRecovery();
  await multiWorkerContention();
  await reconnectRecovery();
  console.log('Inventory durable queue tests passed');
}

export { orderToQueueIntegration, exactlyOnceDeduction, successAndDuplicate,
  transientRetry, deadLetterAndMonitoring, restartRecovery, multiWorkerContention, reconnectRecovery };

if (require.main === module) void main().catch((error: unknown) => {
  console.error('Inventory durable queue tests failed:', error instanceof Error ? error.stack : 'unknown');
  process.exitCode = 1;
});
