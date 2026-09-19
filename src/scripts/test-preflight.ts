import assert from 'node:assert/strict';
import { once } from 'node:events';

async function main() {
  // Isolated dependency stubs: never connect to production services.
  process.env.VERCEL = '1';
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
  process.env.CORS_ALLOWED_ORIGINS = 'https://ordio.in';
  const { sharedRedis } = await import('../lib/redis');
  const { DeductionQueueService } = await import('../services/inventory/deduction-queue.service');
  let waits = 0;
  sharedRedis.initializeAdapter = async () => { waits++; await new Promise<void>(() => {}); };
  DeductionQueueService.processPending = async () => {};
  const { server, io } = await import('../server');
  const { prisma, pool } = await import('../lib/prisma');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const url = `${baseUrl}/api/orders/stats`;
  try {
    const startupWaits = waits;
    const start = performance.now();
    const response = await fetch(url, {
      method: 'OPTIONS', signal: AbortSignal.timeout(1000),
      headers: { Origin: 'https://ordio.in', 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://ordio.in');
    assert.equal(
      response.headers.get(
        'access-control-allow-credentials',
      ),
      'true',
    );
    assert.equal(waits, startupWaits, 'Preflight must not enter dependency middleware');
    console.log(`PASS preflight with stalled Redis: ${Math.round(performance.now() - start)}ms`);
    const rejected = await fetch(url, { method: 'OPTIONS',
      headers: { Origin: 'https://untrusted.example' }, signal: AbortSignal.timeout(1000) });
    assert.equal(rejected.headers.get('access-control-allow-origin'), null);
    assert.equal(waits, startupWaits);
    // Authentication must remain available when realtime Redis is stalled.
    // A malformed body stops before the database, making this an isolated
    // regression test for the HTTP dependency gate rather than credentials.
    const authStart = performance.now();
    const authResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      signal: AbortSignal.timeout(1000),
      headers: { 'Content-Type': 'application/json', Origin: 'https://ordio.in' },
      body: '{}',
    });
    assert.equal(authResponse.status, 400);
    assert.equal(waits, startupWaits, 'Auth must not enter the realtime dependency middleware');
    assert.ok(performance.now() - authStart < 1000);
    // Ordinary routes still wait for dependencies; caller cancellation is bounded.
    await assert.rejects(fetch(url, { signal: AbortSignal.timeout(50) }), { name: 'TimeoutError' });
    assert.equal(waits, startupWaits + 1);
    sharedRedis.initializeAdapter = async () => { throw new Error('test dependency unavailable'); };
    assert.equal((await fetch(url)).status, 503);
    sharedRedis.initializeAdapter = async () => {};
    assert.equal((await fetch(url)).status, 401, 'Auth remains required');
    console.log('PASS origin rejection, stalled-route cancellation, dependency 503, route auth');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => io.close(() => resolve()));
    await prisma.$disconnect();
    await pool.end();
  }
}
main().catch(() => { console.error('FAIL preflight regression'); process.exitCode = 1; });
