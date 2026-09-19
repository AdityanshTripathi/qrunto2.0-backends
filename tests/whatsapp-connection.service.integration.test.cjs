'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { prisma, violations } = require('./support/isolation.cjs');
const { WhatsAppConnectionService } = require('../dist/services/crm/whatsapp-connection.service');

void prisma.brandWhatsAppConnection.findUnique;
void prisma.brandWhatsAppConnection.upsert;
void prisma.brandWhatsAppConnection.create;
void prisma.brandWhatsAppConnection.updateMany;
void prisma.brandWhatsAppConnection.deleteMany;

const originalKey = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
process.env.CRM_CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(64);

after(() => {
  if (originalKey === undefined) delete process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.CRM_CREDENTIAL_ENCRYPTION_KEY = originalKey;
});
after(() => assert.deepEqual(violations, []));

function connection(overrides = {}) {
  return {
    phoneNumberId: '1234567890', encryptedAccessToken: 'invalid', languageCode: 'en_US',
    connectionVersion: '11111111-1111-4111-8111-111111111111',
    status: 'LEGACY_CONNECTED', source: 'MANUAL', displayPhoneNumber: '+919876543210',
    displayName: 'Ordio Test', connectedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastValidatedAt: null, lastTemplateSyncAt: null, lastErrorCode: null, lastErrorMessage: null,
    ...overrides,
  };
}

test('connection service: legacy credentials remain decryptable and status is safe', async t => {
  let row;
  t.mock.method(prisma.brandWhatsAppConnection, 'create', async ({ data }) => {
    row = connection({ ...data }); return row;
  });
  t.mock.method(prisma.brandWhatsAppConnection, 'findUnique', async () => row);
  const service = new WhatsAppConnectionService();
  await service.save('brand-a', '1234567890', 'legacy-access-token', 'en_US');

  assert.deepEqual(await service.get('brand-a'), {
    phoneNumberId: '1234567890', accessToken: 'legacy-access-token', languageCode: 'en_US',
  });
  const status = await service.status('brand-a');
  assert.equal(status.configured, true);
  assert.equal(status.status, 'LEGACY_CONNECTED');
  assert.equal(status.displayPhoneNumber, '*********3210');
  assert.equal(JSON.stringify(status).includes('legacy-access-token'), false);
  assert.equal(JSON.stringify(status).includes('encryptedAccessToken'), false);
});

test('connection service: unusable statuses reject before credential decryption', async t => {
  t.mock.method(prisma.brandWhatsAppConnection, 'findUnique', async () => connection({
    status: 'NEEDS_REAUTH', encryptedAccessToken: 'not-a-valid-encrypted-token',
  }));
  await assert.rejects(new WhatsAppConnectionService().get('brand-a'), error =>
    error.code === 'WHATSAPP_CONNECTION_UNAVAILABLE' && error.status === 'NEEDS_REAUTH');
});

test('connection service: verified Embedded Signup persistence encrypts and marks connected', async t => {
  const inputs = [];
  t.mock.method(prisma.brandWhatsAppConnection, 'upsert', async value => { inputs.push(value); return {}; });
  const service = new WhatsAppConnectionService();
  await service.saveVerifiedEmbeddedSignupConnection('brand-a', {
    phoneNumberId: '1234567890', accessToken: 'server-verified-access-token', languageCode: 'en_US',
    wabaId: 'waba-a', displayName: 'Verified Brand', displayPhoneNumber: '+919876543210',
  });
  await service.saveVerifiedEmbeddedSignupConnection('brand-a', {
    phoneNumberId: '1234567890', accessToken: 'rotated-server-verified-access-token', languageCode: 'en_US',
    wabaId: 'waba-a', displayName: 'Verified Brand', displayPhoneNumber: '+919876543210',
  });
  const input = inputs[0];
  assert.equal(input.create.status, 'CONNECTED');
  assert.equal(input.create.source, 'EMBEDDED_SIGNUP');
  assert.equal(input.create.encryptedAccessToken.includes('server-verified-access-token'), false);
  assert.equal(input.update.lastErrorCode, null);
  assert.equal(input.update.lastErrorMessage, null);
  assert.equal(input.update.lastTemplateSyncAt, null);
  assert.match(input.create.connectionVersion, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(inputs[0].update.connectionVersion, inputs[1].update.connectionVersion);
});

test('connection service: invalid verified details do not attempt a credential overwrite', async t => {
  let writes = 0;
  t.mock.method(prisma.brandWhatsAppConnection, 'upsert', async () => { writes++; return {}; });
  await assert.rejects(new WhatsAppConnectionService().saveVerifiedEmbeddedSignupConnection('brand-a', {
    phoneNumberId: '1234567890', accessToken: '', languageCode: 'en_US', wabaId: 'waba-a',
  }), /incomplete/);
  assert.equal(writes, 0);
});

test('connection service: manual save cannot overwrite an Embedded Signup connection', async t => {
  let writes = 0;
  t.mock.method(prisma.brandWhatsAppConnection, 'findUnique', async () => ({ source: 'EMBEDDED_SIGNUP' }));
  t.mock.method(prisma.brandWhatsAppConnection, 'create', async () => { writes++; return {}; });
  t.mock.method(prisma.brandWhatsAppConnection, 'updateMany', async () => { writes++; return { count: 1 }; });
  await assert.rejects(new WhatsAppConnectionService().save('brand-a', '1234567890', 'manual-token', 'en_US'), error =>
    error.code === 'WHATSAPP_CONNECTION_MANAGED');
  assert.equal(writes, 0);
});

test('connection service: manual reauth save remains legacy and clears stale metadata', async t => {
  let input;
  t.mock.method(prisma.brandWhatsAppConnection, 'findUnique', async () => ({ source: 'MANUAL' }));
  t.mock.method(prisma.brandWhatsAppConnection, 'updateMany', async value => { input = value; return { count: 1 }; });
  await new WhatsAppConnectionService().save('brand-a', '1234567890', 'manual-token', 'en_US');
  assert.deepEqual(input.where, { brandId: 'brand-a', source: 'MANUAL' });
  assert.equal(input.data.status, 'LEGACY_CONNECTED');
  assert.equal(input.data.lastValidatedAt, null);
  assert.equal(input.data.lastTemplateSyncAt, null);
  assert.equal(input.data.lastErrorCode, null);
});

test('connection service: same-number manual token rotations receive distinct versions', async t => {
  const writes = [];
  let exists = false;
  t.mock.method(prisma.brandWhatsAppConnection, 'findUnique', async () => exists ? { source: 'MANUAL' } : null);
  t.mock.method(prisma.brandWhatsAppConnection, 'create', async ({ data }) => {
    exists = true; writes.push(data); return {};
  });
  t.mock.method(prisma.brandWhatsAppConnection, 'updateMany', async ({ data }) => {
    writes.push(data); return { count: 1 };
  });
  const service = new WhatsAppConnectionService();
  await service.save('brand-a', '1234567890', 'first-token', 'en_US');
  await service.save('brand-a', '1234567890', 'second-token', 'en_US');
  assert.match(writes[0].connectionVersion, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(writes[1].connectionVersion, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(writes[0].connectionVersion, writes[1].connectionVersion);
});

test('connection service: delayed state transitions are identity-scoped and allowlisted', async t => {
  const calls = [];
  t.mock.method(prisma.brandWhatsAppConnection, 'updateMany', async input => { calls.push(input); return { count: 1 }; });
  const service = new WhatsAppConnectionService();
  const identity = { connectionVersion: '11111111-1111-4111-8111-111111111111' };
  assert.equal(await service.markNeedsReauth('brand-a', identity, 'META_AUTHENTICATION_FAILED'), true);
  assert.equal(await service.markValidated('brand-a', identity), true);
  assert.equal(await service.recordSafeError('brand-a', identity, 'not-an-allowed-code'), true);
  assert.equal(await service.markTemplatesSynced('brand-a', identity), true);
  assert.ok(calls.every(call => call.where.brandId === 'brand-a'));
  assert.ok(calls.every(call => call.where.connectionVersion === identity.connectionVersion));
  assert.equal(calls[0].data.status, 'NEEDS_REAUTH');
  assert.deepEqual(calls[0].data.lastErrorMessage, 'WhatsApp authentication requires reconnection.');
  assert.equal(calls[2].data.lastErrorCode, 'UNKNOWN_FAILURE');
  assert.equal(calls[2].data.lastErrorMessage, 'WhatsApp connection operation failed.');
});

test('connection service: stale failure after token rotation cannot change the new connection', async t => {
  const current = connection({
    status: 'CONNECTED', source: 'EMBEDDED_SIGNUP', connectionVersion: '22222222-2222-4222-8222-222222222222', connectedAt: new Date('2026-02-01T00:00:00.002Z'),
    lastValidatedAt: new Date('2026-02-01T00:00:00.002Z'), lastTemplateSyncAt: new Date('2026-02-01T00:01:00.000Z'),
  });
  const previousIdentity = { connectionVersion: '11111111-1111-4111-8111-111111111111' };
  t.mock.method(prisma.brandWhatsAppConnection, 'updateMany', async ({ where, data }) => {
    if (where.brandId !== 'brand-a' || where.connectionVersion !== current.connectionVersion) return { count: 0 };
    Object.assign(current, data);
    return { count: 1 };
  });
  const changed = await new WhatsAppConnectionService().markNeedsReauth(
    'brand-a', previousIdentity, 'META_AUTHENTICATION_FAILED',
  );
  assert.equal(changed, false);
  assert.equal(current.status, 'CONNECTED');
  assert.equal(current.lastErrorCode, null);
  assert.equal(current.lastErrorMessage, null);
  assert.equal(current.lastValidatedAt.toISOString(), '2026-02-01T00:00:00.002Z');
  assert.equal(current.lastTemplateSyncAt.toISOString(), '2026-02-01T00:01:00.000Z');
});

test('connection service: wrong brand or nonmatching identity cannot update or disconnect', async t => {
  const current = connection({ connectionVersion: '22222222-2222-4222-8222-222222222222' });
  const noMatch = (where) => where.brandId !== 'brand-a' || where.connectionVersion !== current.connectionVersion;
  t.mock.method(prisma.brandWhatsAppConnection, 'updateMany', async ({ where }) => ({ count: noMatch(where) ? 0 : 1 }));
  t.mock.method(prisma.brandWhatsAppConnection, 'deleteMany', async ({ where }) => ({ count: noMatch(where) ? 0 : 1 }));
  const service = new WhatsAppConnectionService();
  const wrongBrand = { connectionVersion: current.connectionVersion };
  const wrongIdentity = { connectionVersion: '33333333-3333-4333-8333-333333333333' };
  assert.equal(await service.markNeedsReauth('brand-b', wrongBrand), false);
  assert.equal(await service.markValidated('brand-b', wrongBrand), false);
  assert.equal(await service.recordSafeError('brand-b', wrongBrand), false);
  assert.equal(await service.markTemplatesSynced('brand-b', wrongBrand), false);
  assert.equal(await service.disconnect('brand-b', wrongBrand), false);
  assert.equal(await service.markNeedsReauth('brand-a', wrongIdentity), false);
  assert.equal(await service.disconnect('brand-a', wrongIdentity), false);
});

test('connection service: explicit disconnect is limited to a matching connection row', async t => {
  let where;
  t.mock.method(prisma.brandWhatsAppConnection, 'deleteMany', async input => { where = input.where; return { count: 1 }; });
  const identity = { connectionVersion: '11111111-1111-4111-8111-111111111111' };
  assert.equal(await new WhatsAppConnectionService().disconnect('brand-a', identity), true);
  assert.deepEqual(where, { brandId: 'brand-a', ...identity });
});
