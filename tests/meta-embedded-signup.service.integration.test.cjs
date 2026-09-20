'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { after, test } = require('node:test');

const buildRoot = process.env.ORDIO_TEST_BUILD_DIR
  ? path.resolve(process.env.ORDIO_TEST_BUILD_DIR)
  : path.resolve(__dirname, '../dist');
const { prisma, pool, violations } = require('./support/isolation.cjs');
const prismaPath = path.join(buildRoot, 'lib', 'prisma.js');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma, pool },
};

const {
  EmbeddedSignupError,
  MetaEmbeddedSignupService,
} = require(path.join(buildRoot, 'services', 'crm', 'meta-embedded-signup.service.js'));

void prisma.brandWhatsAppConnectionAttempt.create;
void prisma.brandWhatsAppConnectionAttempt.updateMany;
void prisma.brandWhatsAppConnectionAttempt.update;
void prisma.brandWhatsAppConnection.findUnique;

Object.assign(process.env, {
  WHATSAPP_META_APP_ID: '123456789012345',
  WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: '987654321098765',
  WHATSAPP_APP_SECRET: 'unit-test-meta-app-secret',
  WHATSAPP_GRAPH_API_VERSION: 'v26.0',
});

after(() => assert.deepEqual(violations, []));

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function verifiedGraphFetch(overrides = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname.endsWith('/oauth/access_token')) {
      return overrides.exchange ?? response({ access_token: 'verified-business-token', expires_in: 3600 });
    }
    if (url.pathname.endsWith('/debug_token')) {
      return overrides.debug ?? response({
        data: {
          is_valid: true,
          app_id: process.env.WHATSAPP_META_APP_ID,
          scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
          granular_scopes: [
            { scope: 'whatsapp_business_management', target_ids: ['waba-a'] },
            { scope: 'whatsapp_business_messaging', target_ids: ['waba-a'] },
          ],
        },
      });
    }
    if (url.pathname.endsWith('/waba-a/phone_numbers')) {
      return overrides.phones ?? response({
        data: [{ id: 'phone-a', display_phone_number: '+91 98765 43210', verified_name: 'Ordio Test' }],
      });
    }
    if (url.pathname.endsWith('/waba-a')) {
      return overrides.waba ?? response({ id: 'waba-a', name: 'Ordio WABA', owner_business_info: { id: 'business-a' } });
    }
    throw new Error(`Unexpected mocked Meta path: ${url.pathname}`);
  };
  return { fetchImpl, calls };
}

function completeHarness(t, options = {}) {
  const attemptWrites = [];
  let claims = 0;
  let saves = 0;
  let savedConnection;
  t.mock.method(prisma.brandWhatsAppConnectionAttempt, 'updateMany', async input => {
    claims++;
    if (typeof options.claim === 'function') return { count: options.claim(claims, input) ? 1 : 0 };
    return { count: options.claim === false ? 0 : 1 };
  });
  t.mock.method(prisma.brandWhatsAppConnectionAttempt, 'update', async input => {
    attemptWrites.push(input);
    return {};
  });
  t.mock.method(prisma.brandWhatsAppConnection, 'findUnique', async () => options.existing ?? null);
  const writer = {
    async saveVerifiedEmbeddedSignupConnection(brandId, connection) {
      saves++;
      savedConnection = { brandId, connection };
      if (options.saveError) throw options.saveError;
    },
  };
  return {
    attemptWrites,
    writer,
    get claims() { return claims; },
    get saves() { return saves; },
    get savedConnection() { return savedConnection; },
  };
}

const validState = 's'.repeat(43);

test('embedded signup start stores only a state hash bound to the server brand and actor', async t => {
  let created;
  t.mock.method(prisma.brandWhatsAppConnectionAttempt, 'create', async input => {
    created = input;
    return {};
  });
  const result = await new MetaEmbeddedSignupService().start('brand-a', 'user-a');
  assert.equal(result.appId, process.env.WHATSAPP_META_APP_ID);
  assert.equal(result.configId, process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID);
  assert.match(result.state, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(created.data.brandId, 'brand-a');
  assert.equal(created.data.actorUserId, 'user-a');
  assert.match(created.data.stateHash, /^[a-f0-9]{64}$/);
  assert.notEqual(created.data.stateHash, result.state);
  assert.equal(JSON.stringify(result).includes(process.env.WHATSAPP_APP_SECRET), false);
});

test('valid completion verifies Meta assets then persists through the verified connection contract', async t => {
  const harness = completeHarness(t);
  const graph = verifiedGraphFetch();
  await new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer)
    .complete('brand-a', 'user-a', validState, 'one-time-authorization-code');

  assert.equal(harness.saves, 1);
  assert.equal(harness.savedConnection.brandId, 'brand-a');
  assert.deepEqual(harness.savedConnection.connection, {
    phoneNumberId: 'phone-a',
    accessToken: 'verified-business-token',
    languageCode: 'en_US',
    wabaId: 'waba-a',
    metaBusinessId: 'business-a',
    displayName: 'Ordio Test',
    displayPhoneNumber: '+91 98765 43210',
    tokenExpiresAt: harness.savedConnection.connection.tokenExpiresAt,
  });
  assert.ok(harness.savedConnection.connection.tokenExpiresAt instanceof Date);
  assert.equal(harness.attemptWrites.at(-1).data.completedAt instanceof Date, true);
  const exchangeCall = graph.calls.find(call => call.url.pathname.endsWith('/oauth/access_token'));
  assert.equal(exchangeCall.url.searchParams.has('code'), false);
  assert.equal(exchangeCall.init.body.get('code'), 'one-time-authorization-code');
});

test('completion claim is bound to the state hash, user, brand, expiry, and unused status', async t => {
  let claimWhere;
  const harness = completeHarness(t, {
    claim: (_number, input) => { claimWhere = input.where; return false; },
  });
  let fetches = 0;
  await assert.rejects(
    new MetaEmbeddedSignupService(async () => { fetches++; return response({}); }, harness.writer)
      .complete('brand-b', 'user-b', validState, 'code'),
    error => error instanceof EmbeddedSignupError && error.code === 'WHATSAPP_SIGNUP_STATE_INVALID',
  );
  assert.equal(claimWhere.brandId, 'brand-b');
  assert.equal(claimWhere.actorUserId, 'user-b');
  assert.equal(claimWhere.consumedAt, null);
  assert.equal(claimWhere.completedAt, null);
  assert.equal(claimWhere.failedAt, null);
  assert.ok(claimWhere.expiresAt.gt instanceof Date);
  assert.equal(fetches, 0);
  assert.equal(harness.saves, 0);
});

test('expired or replayed state is rejected before Meta exchange', async t => {
  const harness = completeHarness(t, { claim: false });
  let fetches = 0;
  await assert.rejects(
    new MetaEmbeddedSignupService(async () => { fetches++; return response({}); }, harness.writer)
      .complete('brand-a', 'user-a', validState, 'code'),
    error => error.code === 'WHATSAPP_SIGNUP_STATE_INVALID' && error.status === 409,
  );
  assert.equal(fetches, 0);
  assert.equal(harness.saves, 0);
});

test('concurrent completion atomically allows only one claimant', async t => {
  const harness = completeHarness(t, { claim: number => number === 1 });
  const graph = verifiedGraphFetch();
  const service = new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer);
  const results = await Promise.allSettled([
    service.complete('brand-a', 'user-a', validState, 'code-a'),
    service.complete('brand-a', 'user-a', validState, 'code-b'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(harness.saves, 1);
});

test('invalid authorization code returns a safe error and preserves existing credentials', async t => {
  const harness = completeHarness(t);
  const graph = verifiedGraphFetch({
    exchange: response({ error: { message: 'raw-code secret-token provider detail' } }, 400),
  });
  await assert.rejects(
    new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer)
      .complete('brand-a', 'user-a', validState, 'sensitive-authorization-code'),
    error => {
      assert.equal(error.code, 'META_AUTHORIZATION_CODE_INVALID');
      assert.equal(error.status, 400);
      assert.equal(error.message.includes('raw-code'), false);
      assert.equal(error.message.includes('sensitive-authorization-code'), false);
      return true;
    },
  );
  assert.equal(harness.saves, 0);
  assert.equal(JSON.stringify(harness.attemptWrites).includes('secret-token'), false);
});

test('Meta API failure is fail-closed and does not overwrite a connection', async t => {
  const harness = completeHarness(t);
  const graph = verifiedGraphFetch({ exchange: response({ error: { message: 'upstream detail' } }, 503) });
  await assert.rejects(
    new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer)
      .complete('brand-a', 'user-a', validState, 'code'),
    error => error.code === 'META_CONNECTION_UNAVAILABLE' && error.status === 502,
  );
  assert.equal(harness.saves, 0);
});

test('missing token permissions fail before WABA or phone persistence', async t => {
  const harness = completeHarness(t);
  const graph = verifiedGraphFetch({
    debug: response({
      data: {
        is_valid: true,
        app_id: process.env.WHATSAPP_META_APP_ID,
        scopes: ['whatsapp_business_management'],
        granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['waba-a'] }],
      },
    }),
  });
  await assert.rejects(
    new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer)
      .complete('brand-a', 'user-a', validState, 'code'),
    error => error.code === 'META_PERMISSION_DENIED' && error.status === 403,
  );
  assert.equal(harness.saves, 0);
});

test('wrong WABA association is rejected without changing existing credentials', async t => {
  const harness = completeHarness(t);
  const graph = verifiedGraphFetch({ waba: response({ id: 'different-waba', name: 'Wrong WABA' }) });
  await assert.rejects(
    new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer)
      .complete('brand-a', 'user-a', validState, 'code'),
    error => error.code === 'META_WABA_VALIDATION_FAILED',
  );
  assert.equal(harness.saves, 0);
});

test('ambiguous WABA or phone choices require a verified selection flow', async t => {
  await t.test('multiple WABAs', async t => {
    const harness = completeHarness(t);
    const graph = verifiedGraphFetch({
      debug: response({
        data: {
          is_valid: true,
          app_id: process.env.WHATSAPP_META_APP_ID,
          scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
          granular_scopes: [
            { scope: 'whatsapp_business_management', target_ids: ['waba-a', 'waba-b'] },
            { scope: 'whatsapp_business_messaging', target_ids: ['waba-a', 'waba-b'] },
          ],
        },
      }),
    });
    await assert.rejects(
      new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer)
        .complete('brand-a', 'user-a', validState, 'code'),
      error => error.code === 'WHATSAPP_SIGNUP_SELECTION_REQUIRED' && error.status === 409,
    );
    assert.equal(harness.saves, 0);
  });

  await t.test('multiple phones', async t => {
    const harness = completeHarness(t);
    const graph = verifiedGraphFetch({
      phones: response({ data: [{ id: 'phone-a' }, { id: 'phone-b' }] }),
    });
    await assert.rejects(
      new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer)
        .complete('brand-a', 'user-a', validState, 'code'),
      error => error.code === 'WHATSAPP_SIGNUP_SELECTION_REQUIRED' && error.status === 409,
    );
    assert.equal(harness.saves, 0);
  });
});

test('a phone already connected to another brand is unavailable', async t => {
  const harness = completeHarness(t, { existing: { brandId: 'brand-b' } });
  const graph = verifiedGraphFetch();
  await assert.rejects(
    new MetaEmbeddedSignupService(graph.fetchImpl, harness.writer)
      .complete('brand-a', 'user-a', validState, 'code'),
    error => error.code === 'WHATSAPP_PHONE_ALREADY_CONNECTED' && error.status === 409,
  );
  assert.equal(harness.saves, 0);
});
