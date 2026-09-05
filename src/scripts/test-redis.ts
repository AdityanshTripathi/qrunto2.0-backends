import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { safeError, StageError } from '../lib/safe-error';
import { redisUrl, SharedRedis, sharedRedis } from '../lib/redis';

async function main() {
  assert.equal(redisUrl({}), undefined);
  assert.equal(redisUrl({ REDIS_URL: ' redis://primary:6379 ', SOCKET_REDIS_URL: 'redis://legacy:6379' }), 'redis://primary:6379');
  assert.equal(redisUrl({ REDIS_URL: '', SOCKET_REDIS_URL: 'redis://legacy:6379' }), 'redis://legacy:6379');
  assert.throws(() => redisUrl({ REDIS_URL: 'https://private-token@example.test' }), error =>
    error instanceof Error && !error.message.includes('private-token'));

  delete process.env.REDIS_URL;
  delete process.env.SOCKET_REDIS_URL;
  await assert.rejects(new SharedRedis().commands(), /configure REDIS_URL/);
  const local = new Server(createServer());
  await new SharedRedis().initializeAdapter(local);
  await local.close();
  process.env.REDIS_URL = 'redis://mock:6379';

  let connections = 0, created = 0, subscriptions = 0;
  let fail = false;
  const clients: Array<EventEmitter & { isReady: boolean; isOpen: boolean }> = [];
  const factory = ((options: any) => {
    const real = createClient(options);
    assert.equal(real.options?.socket?.tls, process.env.REDIS_URL?.startsWith('rediss://'));
    created++;
    assert.equal(options.disableOfflineQueue, true);
    assert.equal(options.commandsQueueMaxLength, 1000);
    assert.equal(options.socket.connectTimeout, 5000);
    assert.equal(options.socket.reconnectStrategy(0), 250);
    assert.equal(options.socket.reconnectStrategy(1), 500);
    assert.equal(options.socket.reconnectStrategy(2), false);
    const client = Object.assign(new EventEmitter(), {
      isReady: false, isOpen: false,
      async connect() {
        connections++;
        await Promise.resolve();
        if (fail) throw new Error('private-connection-detail');
        client.isReady = client.isOpen = true;
        return client;
      },
      async pSubscribe() { subscriptions++; }, async subscribe() { subscriptions++; },
      async pUnsubscribe() {}, async unsubscribe() {}, async publish() {},
    });
    clients.push(client);
    return client;
  }) as unknown as NonNullable<ConstructorParameters<typeof SharedRedis>[0]>;
  const manager = new SharedRedis(factory);
  const results = await Promise.all(Array.from({ length: 20 }, () => manager.commands()));
  assert.ok(results.every(client => client === results[0]));
  assert.equal(created, 1);
  assert.equal(connections, 1);
  const io = new Server(createServer());
  await Promise.all([manager.initializeAdapter(io), manager.initializeAdapter(io)]);
  assert.equal(created, 2);
  assert.equal(connections, 2);
  assert.equal(subscriptions, 2, 'Real Socket.IO Redis adapter subscribes only once');
  assert.equal(await manager.commands(), results[0]);
  const beforeReconnect = connections;
  const publisher = clients[0]!;
  const subscriber = clients[1]!;
  const errorListeners = publisher.listenerCount('error');
  publisher.isReady = subscriber.isReady = false;
  const recovering = Promise.all(Array.from({ length: 20 }, () => manager.commands()));
  const adapterRecovering = manager.initializeAdapter(io);
  publisher.emit('reconnecting'); // A normal lifecycle event is not an error.
  publisher.emit('error', Object.assign(new Error(), { code: 'ECONNRESET' }));
  assert.equal(connections, beforeReconnect, 'Do not connect an open/reconnecting client');
  publisher.isReady = subscriber.isReady = true;
  publisher.emit('ready');
  subscriber.emit('ready');
  assert.ok((await recovering).every(client => client === results[0]));
  await adapterRecovering;
  assert.equal(created, 2, 'Recovery retains at most two clients');
  assert.equal(subscriptions, 2, 'Recovery must not reinstall the adapter');
  assert.equal(publisher.listenerCount('error'), errorListeners);
  assert.equal(publisher.listenerCount('ready'), 0);
  assert.equal(publisher.listenerCount('end'), 0);
  publisher.isReady = false;
  const exhausted = assert.rejects(manager.commands(), error => error instanceof StageError && error.stage === 'redis.reconnect.wait' && error.code === 'ECONNRESET');
  publisher.isOpen = false;
  publisher.emit('error', Object.assign(new Error(), { code: 'ECONNRESET' }));
  await exhausted;
  assert.equal(await manager.commands(), results[0], 'Terminal reconnect failure can recover on next request');
  publisher.isReady = false;
  const ended = assert.rejects(manager.commands(), error => error instanceof StageError && error.stage === 'redis.reconnect.wait');
  publisher.isOpen = false;
  publisher.emit('end');
  await ended;
  assert.equal(publisher.listenerCount('error'), errorListeners);
  publisher.isOpen = true;
  const originalTimeout = global.setTimeout;
  let expire: (() => void) | undefined;
  global.setTimeout = ((callback: () => void, delay: number) => {
    assert.equal(delay, 20_000);
    expire = callback;
    return originalTimeout(callback, delay);
  }) as typeof setTimeout;
  let timedOut: Promise<unknown>;
  try { timedOut = manager.commands(); } finally { global.setTimeout = originalTimeout; }
  const timeoutCheck = assert.rejects(timedOut, error => error instanceof StageError && error.code === 'ETIMEDOUT');
  expire!();
  await timeoutCheck;
  assert.equal(publisher.listenerCount('error'), errorListeners);
  assert.equal(publisher.listenerCount('ready'), 0);
  assert.equal(publisher.listenerCount('end'), 0);
  clients[0]!.isReady = clients[0]!.isOpen = false;
  fail = true;
  await assert.rejects(manager.commands(), error => error instanceof StageError && error.stage === 'redis.connect' && !error.message.includes('private-connection-detail'));
  fail = false;
  assert.equal(await manager.commands(), results[0], 'Reconnect reuses the same client');
  assert.equal(created, 2);
  process.env.REDIS_URL = 'rediss://default:fake-password@mock:6379';
  await new SharedRedis(factory).commands();
  const privateError = Object.assign(new Error('rediss://default:fake-password@mock token=private CRON_SECRET=private'), { code: 'ECONNRESET' });
  assert.deepEqual(safeError(privateError), { code: 'ECONNRESET', message: 'Connection reset' });
  assert.equal(safeError(new Error(privateError.message)).code, 'UNKNOWN');
  const path = require.resolve('../lib/redis');
  delete require.cache[path];
  assert.equal(require('../lib/redis').sharedRedis, sharedRedis);
  await io.close();
  console.log('PASS: env/TLS, concurrent reuse, adapter initialization, bounded retries, disconnect/reconnect, terminal recovery, listener cleanup, two-client limit, sanitized failures, module reload singleton');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
