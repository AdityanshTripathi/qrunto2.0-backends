import { createClient, RedisClientOptions } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server } from 'socket.io';
import { logSafeError, StageError } from './safe-error';

const defaultRedisClient = (options: RedisClientOptions) => createClient(options);
export type RedisConnection = ReturnType<typeof defaultRedisClient>;

export function redisUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.REDIS_URL?.trim() || env.SOCKET_REDIS_URL?.trim();
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) throw new Error();
    return url;
  } catch {
    throw new Error('Invalid REDIS_URL: expected a redis:// or rediss:// connection URL');
  }
}

export class SharedRedis {
  private commandClient?: RedisConnection;
  private subscriberClient?: RedisConnection;
  private connecting = new WeakMap<RedisConnection, Promise<RedisConnection>>();
  private adapters = new WeakMap<Server, Promise<void>>();

  constructor(private readonly factory = defaultRedisClient) {}

  private client(subscriber: boolean): RedisConnection {
    const existing = subscriber ? this.subscriberClient : this.commandClient;
    if (existing) return existing;
    const url = redisUrl();
    if (!url) throw new Error('Redis unavailable: configure REDIS_URL');
    const client = this.factory({
      url,
      disableOfflineQueue: true,
      commandsQueueMaxLength: 1000,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: retries => retries < 2 ? 250 * (retries + 1) : false,
      },
    });
    client.on('error', error => logSafeError('redis.connection', error));
    if (subscriber) this.subscriberClient = client;
    else this.commandClient = client;
    return client;
  }

  private async ready(client: RedisConnection): Promise<RedisConnection> {
    if (client.isReady) return client;
    const pending = this.connecting.get(client);
    if (pending) return pending;
    // node-redis owns automatic reconnect while isOpen is true. Share a wait
    // with concurrent requests instead of failing or calling connect() again.
    const connecting = (client.isOpen ? this.waitForReconnect(client) : client.connect()).then(() => client).catch(error => {
      if (error instanceof StageError) throw error;
      throw new StageError('redis.connect', error);
    }).finally(() => this.connecting.delete(client));
    this.connecting.set(client, connecting);
    return connecting;
  }

  private waitForReconnect(client: RedisConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (error?: unknown) => {
        clearTimeout(timer);
        client.off('ready', onReady);
        client.off('end', onEnd);
        client.off('error', onError);
        if (error) reject(new StageError('redis.reconnect.wait', error));
        else resolve();
      };
      const onReady = () => finish();
      const onEnd = () => finish(Object.assign(new Error(), { code: 'ECONNRESET' }));
      // Transient errors are followed by more retries. Only reject once the
      // client's retry strategy has closed it; the next request can reconnect.
      const onError = (error: unknown) => { if (!client.isOpen) finish(error); };
      // Covers three 5-second connection attempts plus retry delays.
      const timer = setTimeout(() => finish(Object.assign(new Error(), { code: 'ETIMEDOUT' })), 20_000);
      client.once('ready', onReady);
      client.once('end', onEnd);
      client.on('error', onError);
      if (client.isReady) onReady();
      else if (!client.isOpen) onEnd();
    });
  }

  async commands(): Promise<RedisConnection> {
    return this.ready(this.client(false));
  }

  async initializeAdapter(io: Server): Promise<void> {
    if (!redisUrl()) return; // Single-process development fallback.
    const [publisher, subscriber] = await Promise.all([
      this.commands(), this.ready(this.client(true)),
    ]);
    let pending = this.adapters.get(io);
    if (!pending) {
      pending = Promise.resolve().then(() => { io.adapter(createAdapter(publisher, subscriber)); });
      this.adapters.set(io, pending);
      pending.catch(() => this.adapters.delete(io));
    }
    await pending;
  }
}

// One command/publisher connection and one dedicated Pub/Sub connection per process.
const redisGlobal = globalThis as typeof globalThis & { qruntoRedis?: SharedRedis };
export const sharedRedis = redisGlobal.qruntoRedis ??= new SharedRedis();
