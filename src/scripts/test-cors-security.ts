import assert from 'node:assert/strict';
import { buildAllowedOrigins, createCorsOptions, isOriginAllowed } from '../config/cors';

const trustedOrigin = 'https://app.example.com';
const production = buildAllowedOrigins({
  NODE_ENV: 'production',
  FRONTEND_URL: trustedOrigin,
  ADMIN_URL: 'https://admin.example.com',
});

assert.equal(isOriginAllowed(trustedOrigin, production), true);
assert.equal(isOriginAllowed('https://unknown.example.com', production), false);
assert.equal(isOriginAllowed('http://localhost:5173', production), false);
assert.equal(isOriginAllowed(undefined, production), true);

const development = buildAllowedOrigins({ NODE_ENV: 'development' });
assert.equal(isOriginAllowed('http://localhost:5173', development), true);
assert.equal(isOriginAllowed('https://unknown.example.com', development), false);

assert.throws(() => buildAllowedOrigins({ NODE_ENV: 'production' }));
assert.throws(() => buildAllowedOrigins({ NODE_ENV: 'production', FRONTEND_URL: '*' }));

const options = createCorsOptions({ NODE_ENV: 'production', FRONTEND_URL: trustedOrigin });
assert.equal(options.credentials, false);
assert.ok(options.allowedHeaders?.includes('Authorization'));

console.log('REST and Socket.IO CORS origin policy verified.');
