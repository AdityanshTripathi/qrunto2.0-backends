import { Prisma } from '@prisma/client';

export type MoneyInput = Prisma.Decimal.Value;
// Isolated constructor: do not mutate Prisma/global Decimal rounding settings.
const Decimal = Prisma.Decimal.clone({ precision: 40, rounding: Prisma.Decimal.ROUND_HALF_UP });
export const decimal = (value: MoneyInput): Prisma.Decimal => {
  const result = new Decimal(value);
  if (!result.isFinite()) throw new Error('Money must be finite');
  return result;
};
export const money = (value: MoneyInput): Prisma.Decimal => decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const moneyNumber = (value: MoneyInput): number => {
  const exact = decimal(value);
  const result = exact.toNumber();
  if (!Number.isFinite(result) || !decimal(result).equals(exact)) throw new Error('Money exceeds JSON number precision');
  return result;
};
export const moneyTotal = (values: MoneyInput[]): Prisma.Decimal => values.reduce<Prisma.Decimal>((sum, value) => sum.plus(decimal(value)), decimal(0));
export const lineTotal = (price: MoneyInput, quantity: MoneyInput): Prisma.Decimal => money(decimal(price).times(decimal(quantity)));
export const percentageMoney = (base: MoneyInput, percentage: MoneyInput): Prisma.Decimal => money(decimal(base).times(decimal(percentage)).dividedBy(100));
