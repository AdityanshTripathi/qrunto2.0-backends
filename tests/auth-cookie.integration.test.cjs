'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  refreshCookieOptions,
} = require('../dist/lib/auth-cookie');

function assertSharedCookieOptions(options) {
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, '/api/auth');
  assert.equal(
    Object.hasOwn(options, 'domain'),
    false,
    'refresh cookie must remain host-only',
  );
}

test('refresh cookie is cross-site secure for NODE_ENV production', () => {
  const options = refreshCookieOptions({
    NODE_ENV: 'production',
  });

  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'none');
  assertSharedCookieOptions(options);
});

test('refresh cookie is cross-site secure for VERCEL_ENV production', () => {
  const options = refreshCookieOptions({
    NODE_ENV: 'development',
    VERCEL_ENV: 'production',
  });

  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'none');
  assertSharedCookieOptions(options);
});

test('refresh cookie remains suitable for local development', () => {
  const options = refreshCookieOptions({
    NODE_ENV: 'development',
  });

  assert.equal(options.secure, false);
  assert.equal(options.sameSite, 'lax');
  assertSharedCookieOptions(options);
});
