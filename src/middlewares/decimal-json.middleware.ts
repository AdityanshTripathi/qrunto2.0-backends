import type { RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { moneyNumber } from '../lib/money';

export function decimalJson(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Prisma.Decimal.isDecimal(value)) return moneyNumber(value);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => decimalJson(item, seen));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decimalJson(item, seen)]));
}

export const decimalJsonMiddleware: RequestHandler = (_req, res, next) => {
  const json = res.json.bind(res);
  res.json = ((body?: unknown) => json(decimalJson(body))) as typeof res.json;
  next();
};
