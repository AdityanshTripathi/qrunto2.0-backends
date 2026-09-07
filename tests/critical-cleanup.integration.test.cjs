'use strict';
const { violations } = require('./support/isolation.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { safeError } = require('../dist/lib/safe-error');
const { joinTenantRoom } = require('../dist/lib/socket-room');
const { withRequestId } = require('../dist/lib/request-context');
after(() => assert.equal(violations.length, 0));

test('Redaction: inherited keys cannot masquerade as approved error codes', () => {
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    for (const error of [new Error(`${key} synthetic-sensitive-detail`), Object.assign(new Error('synthetic-sensitive-detail'), { code: key })]) {
      const safe = safeError(error);
      assert.equal(safe.code, 'UNKNOWN'); assert.equal(typeof safe.message, 'string');
      assert.ok(!JSON.stringify(safe).includes('synthetic-sensitive-detail'));
    }
  }
  assert.deepEqual(safeError(Object.assign(new Error('private detail'), { code: 'ECONNRESET' })), { code: 'ECONNRESET', message: 'Connection reset' });
});

test('Socket rooms: synchronous and asynchronous joins preserve tenant and handle failure safely', async t => {
  const logs = []; t.mock.method(console, 'error', row => logs.push(row));
  for (const asynchronous of [false, true]) {
    for (const fails of [false, true]) {
      const rooms = [], disconnects = [], id = randomUUID();
      const socket = {
        id: 'test-socket',
        join(room) {
          rooms.push(room);
          if (fails) {
            const error = Object.assign(new Error('synthetic-sensitive-detail'), { code: 'ECONNRESET' });
            if (asynchronous) return Promise.reject(error);
            throw error;
          }
          if (asynchronous) return Promise.resolve();
        },
        disconnect(force) { disconnects.push(force); return this; },
      };
      await withRequestId(id, () => joinTenantRoom(socket, 'trusted-test-tenant'));
      assert.deepEqual(rooms, ['trusted-test-tenant']);
      assert.deepEqual(disconnects, fails ? [true] : []);
      if (fails) {
        const row = logs.at(-1);
        assert.equal(row.requestId, id); assert.equal(row.stage, 'room.join');
        assert.equal(row.code, 'ECONNRESET'); assert.equal(row.service, 'socket.io');
      }
    }
  }
  assert.equal(logs.length, 2); assert.ok(!JSON.stringify(logs).includes('synthetic-sensitive-detail'));
});
