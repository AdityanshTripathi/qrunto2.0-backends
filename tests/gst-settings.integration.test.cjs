'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { prisma, violations } = require('./support/isolation.cjs');
const { fixtures } = require('./support/fixtures.cjs');
const { SettingsController } = require('../dist/controllers/settings.controller');

const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function mock(t, object, method, implementation) {
  void object[method];
  return t.mock.method(object, method, implementation);
}

after(() => assert.equal(violations.length, 0));

test('GST setting persists per restaurant and does not rewrite the configured tax rate or GSTIN', async (t) => {
  const db = fixtures();
  const tenant = db.tenant(1);
  const res = response();
  const settings = { restaurantId: tenant.restaurant.id, currency: 'INR', gstEnabled: false, taxPercentage: 5 };

  mock(t, prisma.restaurant, 'update', async ({ where, data }) => {
    assert.equal(where.id, tenant.restaurant.id);
    assert.deepEqual(data, { gstNumber: '07AAAAA1111A1Z1' });
    return { ...tenant.restaurant, ...data };
  });
  mock(t, prisma.restaurantSetting, 'upsert', async ({ where, update, create }) => {
    assert.equal(where.restaurantId, tenant.restaurant.id);
    assert.deepEqual(update, { gstEnabled: false, taxPercentage: 5 });
    assert.equal(create.gstEnabled, false);
    assert.equal(create.taxPercentage, 5);
    return settings;
  });

  await new SettingsController().updateSettings({
    user: tenant.user,
    body: { gstEnabled: false, gstNumber: '07AAAAA1111A1Z1', taxPercentage: 5 },
  }, res);

  assert.equal(res.code, 200);
  assert.equal(res.body.settings.gstEnabled, false);
  assert.equal(res.body.settings.taxPercentage, 5);
});
