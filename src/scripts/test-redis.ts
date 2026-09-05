import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
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
    created++;
    assert.equal(options.disableOfflineQueue, true);
    assert.equal(options.commandsQueueMaxLength, 1000);
    assert.equal(options.socket.connectTimeout, 5000);
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
  clients[0]!.isReady = clients[0]!.isOpen = false;
  fail = true;
  await assert.rejects(manager.commands(), error => error instanceof Error && error.message === 'Redis temporarily unavailable');
  fail = false;
  assert.equal(await manager.commands(), results[0], 'Reconnect reuses the same client');
  assert.equal(created, 2);
  const path = require.resolve('../lib/redis');
  delete require.cache[path];
  assert.equal(require('../lib/redis').sharedRedis, sharedRedis);
  await io.close();
  console.log('PASS: env precedence/validation, optional local fallback, required cron config, concurrent reuse, real adapter initialization, bounded retries, sanitized failures, module reload singleton');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
