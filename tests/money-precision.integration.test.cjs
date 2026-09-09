'use strict';
require('./support/isolation.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { Prisma } = require('@prisma/client');
const { decimal, money, moneyNumber, moneyTotal, lineTotal, percentageMoney } = require('../dist/lib/money');
const { decimalJson } = require('../dist/middlewares/decimal-json.middleware');
const { CouponService } = require('../dist/services/crm/coupon.service');

test('Money: decimal arithmetic, line totals, GST and half-up rounding are exact', () => {
  assert.equal(decimal('0.1').plus('0.2').toString(), '0.3');
  assert.equal(lineTotal('99.99', 3).toFixed(2), '299.97');
  assert.equal(lineTotal('0.10', 3).toFixed(2), '0.30');
  const subtotal = moneyTotal([lineTotal('99.99', 3), lineTotal('0.10', 3)]);
  const gst = percentageMoney(subtotal, '18');
  assert.equal(subtotal.toFixed(2), '300.27'); assert.equal(gst.toFixed(2), '54.05');
  assert.equal(money(subtotal.plus(gst)).toFixed(2), '354.32');
  assert.equal(money('1.005').toFixed(2), '1.01');
  assert.equal(money('-1.005').toFixed(2), '-1.01');
  assert.equal(money('999999999999.995').toFixed(2), '1000000000000.00');
});

test('Money: percentage coupon rounds once, caps safely and applies only once', async () => {
  const updates = [];
  const service = new CouponService();
  const tx = {
    customer: { findFirst: async () => ({ brandId: 'brand' }) },
    restaurant: { findUnique: async () => ({ brandId: 'brand' }) },
    coupon: { findFirst: async () => ({ id: 'coupon', discountType: 'PERCENTAGE', discountValue: decimal('33.333'), minOrderAmount: decimal('0'), maxDiscountAmount: decimal('40') }) },
    customerCoupon: { findFirst: async () => ({ id: 'issue' }), updateMany: async value => { updates.push(value); return { count: 1 }; } },
  };
  assert.equal((await service.validateAndRedeem('customer', 'CODE', 100, 'order', tx, 'restaurant')).discountAmount, 33.33);
  tx.coupon.findFirst = async () => ({ id: 'coupon', discountType: 'PERCENTAGE', discountValue: decimal('99'), minOrderAmount: decimal('0'), maxDiscountAmount: decimal('12.345') });
  assert.equal((await service.validateAndRedeem('customer', 'CODE', 100, 'order', tx, 'restaurant')).discountAmount, 12.35);
  assert.equal(updates.length, 2);
});

test('Money: partial/full refunds and zero/large totals stay exact', () => {
  assert.equal(money(decimal('100').minus('0.1').minus('0.2')).toFixed(2), '99.70');
  assert.equal(money(decimal('100').minus('25.25')).toFixed(2), '74.75');
  assert.equal(money(decimal('100').minus('100')).toFixed(2), '0.00');
  assert.equal(moneyTotal([]).toFixed(2), '0.00');
  assert.equal(moneyNumber(decimal('9999999999999.99')), 9999999999999.99);
  assert.throws(() => decimal('NaN'), /finite/);
});

test('Money: Decimal API values remain JSON numbers without mutating inputs', () => {
  const source = { order: { subtotal: decimal('0.30'), totalAmount: decimal('354.32') }, values: [decimal('99.99')], createdAt: new Date('2026-09-07') };
  const output = decimalJson(source);
  assert.deepEqual(output, { order: { subtotal: 0.3, totalAmount: 354.32 }, values: [99.99], createdAt: source.createdAt });
  assert.ok(Prisma.Decimal.isDecimal(source.order.subtotal));
  assert.equal(typeof output.order.subtotal, 'number');
});

test('Money migration: all audited fields use NUMERIC and migration is guarded/non-destructive', () => {
  const fields = JSON.parse(readFileSync('tests/money-fields.json', 'utf8'));
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const sql = readFileSync('prisma/migrations/20260907000000_money_numeric/migration.sql', 'utf8');
  assert.equal(fields.length, 38);
  for (const field of fields) {
    assert.match(schema, new RegExp(`\\b${field.name}\\s+Decimal\\??[^\\n]*@db\\.Decimal\\(15, ${field.scale}\\)`));
    assert.match(sql, new RegExp(`ALTER COLUMN "${field.column}" TYPE NUMERIC\\(15,${field.scale}\\)`));
    assert.match(sql, new RegExp(`Money preflight failed: ${field.table}\\.${field.column}`));
  }
  assert.match(sql, /^-- Review-only/); assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/i);
  assert.equal((schema.match(/\bFloat\??/g) || []).length, 23, 'Only non-money rates, scores and quantities remain Float');
});
