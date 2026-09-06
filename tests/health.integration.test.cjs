'use strict';
const { violations } = require('./support/isolation.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
test('Monitoring: HTTP liveness, dependency readiness, timeouts and structured secret redaction', require('../dist/scripts/test-health-readiness').main);
test('Security: REST and Socket.IO CORS allowlist', () => require('../dist/scripts/test-cors-security'));
after(() => assert.equal(violations.length, 0));
