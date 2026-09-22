import assert from 'node:assert/strict';
import { observeOperation } from '../lib/operation-timing';
import { withRequestId } from '../lib/request-context';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function main(): Promise<void> {
  const warnings: unknown[] = [];
  const errors: unknown[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (entry: unknown) => { warnings.push(entry); };
  console.error = (entry: unknown) => { errors.push(entry); };

  try {
    const requestId = '955a1197-645f-4c48-98e9-5c81c3521e10';
    await withRequestId(requestId, async () => {
      assert.equal(await observeOperation('redis.adapter.request', async () => 'ready', { slowMs: 10 }), 'ready');
    });
    await wait(25);
    assert.equal(warnings.length, 0, 'Normal operations must clear their diagnostic timer');

    let release: (() => void) | undefined;
    const stalled = withRequestId(requestId, () => observeOperation(
      'redis.adapter.request',
      () => new Promise<void>(resolve => { release = resolve; }),
      { slowMs: 10 },
    ));
    await wait(25);
    assert.equal(warnings.length, 1, 'A stalled operation must emit one diagnostic log');
    const warning = warnings[0] as Record<string, unknown>;
    assert.equal(warning.level, 'warn');
    assert.equal(warning.service, 'dependency');
    assert.equal(warning.stage, 'redis.adapter.request');
    assert.equal(warning.status, 'slow');
    assert.equal(warning.code, 'OK');
    assert.equal(warning.message, 'Operation exceeded diagnostic threshold');
    assert.equal(warning.requestId, requestId);
    assert.equal(typeof warning.durationMs, 'number');
    assert.ok((warning.durationMs as number) >= 10);
    release!();
    await stalled;
    assert.equal(warnings.length, 1, 'Completion after a stall must not duplicate the warning');

    await assert.rejects(
      withRequestId(requestId, () => observeOperation(
        'database.auth.user.lookup',
        async () => { throw Object.assign(new Error('database connection failed'), { code: 'P1001' }); },
        { slowMs: 10 },
      )),
    );
    assert.equal(errors.length, 1, 'A failed operation must emit one safe diagnostic error');
    const error = errors[0] as Record<string, unknown>;
    assert.equal(error.service, 'dependency');
    assert.equal(error.stage, 'database.auth.user.lookup');
    assert.equal(error.code, 'P1001');
    assert.equal(error.requestId, requestId);
    assert.equal(JSON.stringify(error).includes('secret'), false);
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }

  console.log('Operation timing tests passed');
}

if (require.main === module) void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Operation timing test failed');
  process.exitCode = 1;
});
