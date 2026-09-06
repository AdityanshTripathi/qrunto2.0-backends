import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const context = new AsyncLocalStorage<string>();
// Accept only opaque UUIDv4 IDs, never arbitrary client text or credentials.
export function sanitizeRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length === 36
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : undefined;
}

export const getRequestId = (): string | undefined => context.getStore();
export const requestIdOrNew = (): string => getRequestId() ?? randomUUID();
export function withRequestId<T>(id: unknown, action: () => T): T {
  return context.run(sanitizeRequestId(id) ?? randomUUID(), action);
}
