import 'dotenv/config';
import assert from 'node:assert/strict';
import { DeductionJob, DurableDeductionQueue, QueueStore } from '../services/inventory/durable-deduction-queue';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { OrderService } from '../services/order.service';
import { DeductionQueueService } from '../services/inventory/deduction-queue.service';

class FakeStore implements QueueStore {
  readonly strings = new Map<string, string>();
  readonly lists = new Map<string, string[]>();

  async eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<number> {
    if (script.includes('inventory-enqueue')) {
      if (this.strings.has(options.keys[0]!)) return 0;
      this.strings.set(options.keys[0]!, 'queued');
      await this.rPush(options.keys[1]!, options.arguments[0]!);
      return 1;
    }
    if (this.strings.get(options.keys[0]!) === options.arguments[0]) {
      this.strings.delete(options.keys[0]!);
      return 1;
    }
    return 0;
  }

  async get(key: string): Promise<string | null> { return this.strings.get(key) ?? null; }
  async set(key: string, value: string, options?: { NX?: boolean }): Promise<string | null> {
    if (options?.NX && this.strings.has(key)) return null;
    this.strings.set(key, value);
    return 'OK';
  }
  async lMove(source: string, destination: string): Promise<string | null> {
    const raw = this.list(source).shift() ?? null;
    if (raw) this.list(destination).push(raw);
    return raw;
  }
  async rPush(key: string, value: string): Promise<number> { return this.list(key).push(value); }
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

async function main(): Promise<void> {
  await orderToQueueIntegration();
  await exactlyOnceDeduction();
  await successAndDuplicate();
  await transientRetry();
  await restartRecovery();
  await multiWorkerContention();
  console.log('Inventory durable queue tests passed');
}

void main().catch((error: unknown) => {
  console.error('Inventory durable queue tests failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
