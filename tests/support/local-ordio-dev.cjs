'use strict';

const { randomBytes } = require('node:crypto');
const { URL } = require('node:url');

function rejectUnsafeDatabase() {
  // Deliberately avoid including the supplied value in the error: it can contain credentials.
  throw new Error('Local integration tests require a valid ORDIO_LOCAL_TEST_DATABASE_URL for local ordio_dev.');
}

function configureLocalTestDatabase() {
  const suppliedUrl = process.env.ORDIO_LOCAL_TEST_DATABASE_URL;
  if (typeof suppliedUrl !== 'string' || suppliedUrl.length === 0) rejectUnsafeDatabase();

  let parsed;
  try {
    parsed = new URL(suppliedUrl);
  } catch {
    rejectUnsafeDatabase();
  }

  const valid =
    (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') &&
    parsed.hostname === '127.0.0.1' &&
    parsed.port === '5432' &&
    parsed.pathname === '/ordio_dev' &&
    parsed.search === '?sslmode=disable' &&
    parsed.hash === '' &&
    parsed.username.length > 0 &&
    parsed.password.length > 0;

  if (!valid) rejectUnsafeDatabase();

  // Set only after validation and before any database-capable module is imported.
  process.env.DATABASE_URL = suppliedUrl;
  process.env.DIRECT_URL = suppliedUrl;
  process.env.CRM_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('hex');
}

configureLocalTestDatabase();

const { prisma, pool } = require('../../dist/lib/prisma');

module.exports = { prisma, pool };
