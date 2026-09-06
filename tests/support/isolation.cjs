'use strict';
// Load before any application module. No .env files or inherited app credentials.
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const keep = /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|COMSPEC|PATHEXT|NODE_TEST_CONTEXT|FORCE_COLOR|NO_COLOR)$/i;
for (const key of Object.keys(process.env)) if (!keep.test(key)) delete process.env[key];
Object.assign(process.env, {
  NODE_ENV: 'test', VERCEL: '1', TZ: 'UTC',
  JWT_SECRET: 'integration-only-access-signing-key',
  JWT_REFRESH_SECRET: 'integration-only-refresh-signing-key',
  CRON_SECRET: 'integration-only-cron-key',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/integration_test',
  FRONTEND_URL: 'http://127.0.0.1',
});
const dotenv = require('dotenv');
dotenv.config = () => ({ parsed: {} });
require.cache[require.resolve('dotenv/config')] = { exports: {}, loaded: true };

const violations = [];
function blocked(kind) {
  violations.push(kind);
  throw new Error(`Integration isolation: blocked ${kind}`);
}
const ports = new Set();
const originalEmit = net.Server.prototype.emit;
net.Server.prototype.emit = function (event, ...args) {
  if (event === 'listening') {
    const address = this.address();
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1') blocked('non-loopback listener');
    ports.add(address.port);
    this.once('close', () => ports.delete(address.port));
  }
  return originalEmit.call(this, event, ...args);
};
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const input = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof input[0] === 'object' ? input[0] : { port: input[0], host: input[1] };
  if (options.path || options.host !== '127.0.0.1' || !ports.has(Number(options.port))) blocked('network connection');
  return originalConnect.apply(this, args);
};
tls.connect = () => blocked('TLS connection');

const models = new Map();
const prisma = new Proxy({
  $disconnect: async () => {},
  $transaction: async () => blocked('unconfigured transaction'),
}, {
  get(target, key) {
    if (key in target) return target[key];
    if (!models.has(key)) models.set(key, new Proxy({}, {
      get(model, method) {
        if (!(method in model)) model[method] = async () => blocked(`unconfigured database operation ${String(key)}.${String(method)}`);
        return model[method];
      },
    }));
    return models.get(key);
  },
});
const pool = { end: async () => {}, connect: async () => blocked('database connection') };
const prismaPath = path.resolve(__dirname, '../../dist/lib/prisma.js');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma, pool } };
module.exports = { prisma, pool, violations, ports };
