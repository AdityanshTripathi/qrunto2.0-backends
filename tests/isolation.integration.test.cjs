'use strict';
const { violations, prisma } = require('./support/isolation.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
test('Safety: .env disabled; non-test network, DB and Redis access fail closed', async () => {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.REDIS_URL, undefined);
  assert.deepEqual(require('dotenv').config(), { parsed: {} });
  for (const host of ['example.test', '127.0.0.1']) {
    assert.throws(() => net.connect({ host, port: 6379 }), /Integration isolation/);
  }
  await assert.rejects(prisma.order.deleteMany({}), /Integration isolation/);
  assert.equal(violations.length, 3);
});
