'use strict';
require('./support/isolation.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { prisma, violations } = require('./support/isolation.cjs');
const { PublicController } = require('../dist/controllers/public.controller');

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const restaurant = { id: id(1), slug: 'idempotent-checkout', isActive: true, settings: { taxPercentage: 10 } };
const table = { id: id(2), restaurantId: restaurant.id, tableNumber: '1', isActive: true };
const menu = { id: id(3), restaurantId: restaurant.id, name: 'Retry-safe meal', price: 100, isAvailable: true };

after(() => assert.equal(violations.length, 0, 'No external connections or unconfigured DB operations'));

function checkoutHarness() {
  const committed = new Map();
  const claims = new Map();
  const orders = [];
  let sequence = 10;

  prisma.restaurant.findUnique = async ({ where }) => where.slug === restaurant.slug ? structuredClone(restaurant) : null;
  prisma.restaurantTable.findFirst = async ({ where }) =>
    where.restaurantId === restaurant.id && where.tableNumber === table.tableNumber ? structuredClone(table) : null;
  prisma.menuItem.findMany = async ({ where }) =>
    where.restaurantId === restaurant.id && where.id.in.includes(menu.id) ? [structuredClone(menu)] : [];
  prisma.checkoutIdempotency.findUnique = async ({ where }) => {
    const scopedKey = `${where.restaurantId_key.restaurantId}:${where.restaurantId_key.key}`;
    const record = committed.get(scopedKey);
    if (!record) return null;
    return { ...structuredClone(record), order: structuredClone(orders.find(order => order.id === record.orderId) ?? null) };
  };

  prisma.$transaction = async callback => {
    let localRecord;
    let claim;
    const tx = {
      checkoutIdempotency: {
        create: async ({ data }) => {
          const scopedKey = `${data.restaurantId}:${data.key}`;
          const existingClaim = claims.get(scopedKey);
          if (existingClaim) {
            await existingClaim.done;
            const error = new Error('Unique constraint failed');
            error.code = 'P2002';
            throw error;
          }
          let release;
          claim = { scopedKey, done: new Promise(resolve => { release = resolve; }), release };
          claims.set(scopedKey, claim);
          localRecord = { id: id(sequence++), ...data, orderId: null };
          return structuredClone(localRecord);
        },
        update: async ({ data }) => {
          localRecord.orderId = data.orderId;
          return structuredClone(localRecord);
        },
      },
      order: {
        findFirst: async () => null,
        create: async ({ data }) => {
          const order = {
            id: id(sequence++),
            ...data,
            createdAt: new Date('2026-09-11T00:00:00.000Z'),
            table: structuredClone(table),
            orderItems: structuredClone(data.orderItems.create),
          };
          orders.push(order);
          return structuredClone(order);
        },
      },
      notification: { create: async ({ data }) => structuredClone(data) },
    };

    try {
      const result = await callback(tx);
      if (localRecord) committed.set(claim.scopedKey, structuredClone(localRecord));
      return result;
    } finally {
      if (claim) {
        claims.delete(claim.scopedKey);
        claim.release();
      }
    }
  };

  const invoke = async (key, body = {}) => {
    const response = { statusCode: 200, body: undefined };
    const res = {
      status(code) { response.statusCode = code; return this; },
      json(value) { response.body = value; return this; },
    };
    await new PublicController().placeOrder({
      params: { slug: restaurant.slug },
      headers: { 'idempotency-key': key },
      body: { tableNumber: '1', items: [{ menuItemId: menu.id, quantity: 1 }], ...body },
      app: { get: () => null },
    }, res);
    return response;
  };

  return { invoke, orders };
}

test('Checkout idempotency: sequential retry returns the original order and changed payload is rejected', async () => {
  const { invoke, orders } = checkoutHarness();
  const first = await invoke('sequential-retry-key');
  const replay = await invoke('sequential-retry-key');

  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.order.id, first.body.order.id);
  assert.equal(orders.length, 1);

  const conflict = await invoke('sequential-retry-key', { notes: 'different request' });
  assert.equal(conflict.statusCode, 409);
  assert.match(conflict.body.error, /different checkout request/);
  assert.equal(orders.length, 1);
});

test('Checkout idempotency: concurrent duplicate requests create one order and both return it', async () => {
  const { invoke, orders } = checkoutHarness();
  const [first, second] = await Promise.all([
    invoke('concurrent-retry-key'),
    invoke('concurrent-retry-key'),
  ]);

  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 201]);
  assert.equal(first.body.order.id, second.body.order.id);
  assert.equal(orders.length, 1);
});
