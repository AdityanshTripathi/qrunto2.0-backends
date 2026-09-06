'use strict';
const { violations } = require('./support/isolation.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
test('Redis: shared clients, real Socket.IO adapter, reconnects, bounded attempts and redaction', require('../dist/scripts/test-redis').main);
after(() => assert.equal(violations.length, 0));
