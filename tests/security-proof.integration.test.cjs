'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('./support/isolation.cjs');
const {
  issueSecurityProof,
  validateSecurityProof,
} = require('../dist/services/security-proof.service.js');
const { requireSecurityProof } = require('../dist/middlewares/security-proof.middleware.js');
const { PasscodeController } = require('../dist/controllers/passcode.controller.js');

const identity = {
  userId: 'user-a', restaurantId: 'restaurant-a', scope: 'analytics', accessTokenFingerprint: 'token-fingerprint-a',
};
const response = () => {
  const result = { statusCode: 200, body: null, headers: {} };
  result.status = (code) => { result.statusCode = code; return result; };
  result.json = (body) => { result.body = body; return result; };
  result.setHeader = (key, value) => { result.headers[key] = value; };
  return result;
};

test('SEC-001: server verification issues a short-lived scoped proof without passcode material', async () => {
  const hash = await bcrypt.hash('correct-passcode', 4);
  prisma.restaurantSetting.findUnique = async () => ({ passcode: hash });
  const req = {
    user: { id: identity.userId, restaurantId: identity.restaurantId, role: 'RESTAURANT_OWNER' },
    accessTokenFingerprint: identity.accessTokenFingerprint,
    body: { passcode: 'correct-passcode', scope: identity.scope },
  };
  const res = response();
  await new PasscodeController().verifyPasscode(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.proof, 'string');
  assert.equal(validateSecurityProof(res.body.proof, identity), true);
  assert.ok(Date.parse(res.body.expiresAt) > Date.now());
  const payload = JSON.parse(Buffer.from(res.body.proof.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(JSON.stringify(payload).includes('correct-passcode'), false);
  assert.equal(JSON.stringify(payload).includes('access-token'), false);
});

test('SEC-001: malformed, tampered, expired, cross-user, cross-tenant, cross-scope, and cross-session proofs fail', () => {
  const { proof } = issueSecurityProof(identity);
  assert.equal(validateSecurityProof('not-a-jwt', identity), false);
  assert.equal(validateSecurityProof(`${proof.slice(0, -1)}x`, identity), false);
  assert.equal(validateSecurityProof(proof, { ...identity, userId: 'user-b' }), false);
  assert.equal(validateSecurityProof(proof, { ...identity, restaurantId: 'restaurant-b' }), false);
  assert.equal(validateSecurityProof(proof, { ...identity, scope: 'settings' }), false);
  assert.equal(validateSecurityProof(proof, { ...identity, accessTokenFingerprint: 'token-fingerprint-b' }), false);
  const expired = jwt.sign({ typ: 'security-proof', ver: 1, sub: identity.userId, tenant: identity.restaurantId, scope: identity.scope, session: identity.accessTokenFingerprint, jti: 'expired' }, process.env.JWT_SECRET, {
    algorithm: 'HS256', audience: 'ordio-security-proof', issuer: 'ordio', expiresIn: -1,
  });
  assert.equal(validateSecurityProof(expired, identity), false);
});

test('SEC-001: protected middleware rejects direct calls without a valid proof and accepts the bound proof', () => {
  const middleware = requireSecurityProof('analytics');
  const baseRequest = {
    user: { id: identity.userId, restaurantId: identity.restaurantId },
    accessTokenFingerprint: identity.accessTokenFingerprint,
  };
  const missing = response();
  middleware({ ...baseRequest, header: () => undefined }, missing, () => assert.fail('must not continue'));
  assert.equal(missing.statusCode, 403);

  const { proof } = issueSecurityProof(identity);
  let continued = false;
  middleware({ ...baseRequest, header: () => proof }, response(), () => { continued = true; });
  assert.equal(continued, true);
});
