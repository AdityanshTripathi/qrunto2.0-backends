'use strict';
const { violations, prisma, pool } = require('./support/isolation.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
test('CRM: cron auth/rotation, scheduler, duplicate locks, retry bounds, DLQ, status and Vercel startup', require('../dist/scripts/test-crm-cron').main);
after(async () => { await prisma.$disconnect(); await pool.end(); assert.equal(violations.length, 0); });
