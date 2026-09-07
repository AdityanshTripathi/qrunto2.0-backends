import { prisma } from './prisma';

// Existing INR/India product default; each restaurant can override it.
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export function isTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || /^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}
export function timezone(value: unknown): string { return isTimezone(value) ? value : DEFAULT_TIMEZONE; }
export async function restaurantTimezone(restaurantId: string): Promise<string> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  return timezone(restaurant?.timezone);
}
export class BusinessDateError extends Error {}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localParts(date: Date, zone: string) {
  zone = timezone(zone);
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    formatters.set(zone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, hour: Number(parts.hour), weekday: new Date(day + 'T00:00:00Z').getUTCDay() };
}
export function localDate(date: Date, zone: string): string { return localParts(date, zone).day; }
export function localHourKey(date: Date, zone: string): string {
  const parts = localParts(date, zone);
  const offset = new Intl.DateTimeFormat('en', { timeZone: timezone(zone), timeZoneName: 'longOffset' }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value;
  return `${parts.day}T${String(parts.hour).padStart(2, '0')}${offset}`;
}
export function validDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BusinessDateError('Use YYYY-MM-DD dates');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw new BusinessDateError('Invalid date');
  return value;
}
export function addDays(day: string, days: number): string {
  const date = new Date(validDate(day) + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
// Search for the first instant of a local day, including midnight DST transitions
// and skipped dates, without assuming a fixed number of hours per business day.
export function dayStart(day: string, zone: string): Date {
  const nominal = +new Date(validDate(day) + 'T00:00:00Z');
  let lo = nominal - 2 * 86400000, hi = nominal + 2 * 86400000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(new Date(mid), zone) < day) lo = mid + 1; else hi = mid;
  }
  return new Date(lo);
}
export function dateRange(start: unknown, end: unknown, zone: string, now = new Date(), lookback = 30) {
  const today = localDate(now, zone);
  const from = start === undefined ? addDays(today, -lookback) : validDate(start);
  const through = end === undefined ? today : validDate(end);
  if (from > through) throw new BusinessDateError('startDate must not exceed endDate');
  return { gte: dayStart(from, zone), lt: dayStart(addDays(through, 1), zone) };
}
export function daysAgo(days: number, zone: string, now = new Date()): Date {
  return dayStart(addDays(localDate(now, zone), -days), zone);
}
export function calendarDaysSince(then: Date, now: Date, zone: string): number {
  return Math.round((Date.parse(localDate(now, zone)) - Date.parse(localDate(then, zone))) / 86400000);
}
// Date-only values are business dates; offset-bearing timestamps stay instants.
export function dateInput(value: string, zone: string, end = false): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return end ? new Date(+dayStart(addDays(value, 1), zone) - 1) : dayStart(value, zone);
  }
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) throw new BusinessDateError('Timestamp requires an explicit timezone offset');
  return new Date(value);
}

// Legacy analytics endpoints also accepted ISO timestamps as calendar filters.
export function dateFilterRange(start: unknown, end: unknown, zone: string, now = new Date()) {
  const calendar = (value: unknown) => typeof value === 'string' && value.includes('T')
    ? localDate(dateInput(value, zone), zone) : value;
  return dateRange(calendar(start), calendar(end), zone, now);
}

export function occasionDays(value: string, now: Date, zone: string): number {
  let day: string;
  try { day = validDate(value.slice(0, 10)); } catch { return Infinity; }
  const today = localDate(now, zone);
  const year = Number(today.slice(0, 4));
  // Feb 29 retains the existing JS calendar rollover policy in non-leap years.
  let next = new Date(`${year}${day.slice(4)}T00:00:00Z`);
  if (next.toISOString().slice(0, 10) < today) next = new Date(`${year + 1}${day.slice(4)}T00:00:00Z`);
  return Math.round((+next - Date.parse(today)) / 86400000);
}

// HTML datetime-local input. Earliest occurrence for overlaps; reject DST gaps.
export function localDateTime(value: string, zone: string): Date {
  if (/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return dateInput(value, zone);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new BusinessDateError('Invalid local date/time');
  validDate(value.slice(0, 10));
  const nominal = Date.parse(value + 'Z');
  if (!Number.isFinite(nominal)) throw new BusinessDateError('Invalid local date/time');
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone(zone), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = (date: Date) => formatter.format(date).replace(' ', 'T');
  const target = value.length === 16 ? value + ':00' : value;
  const candidates = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = nominal + hours * 3600000;
    const offset = Date.parse(wall(new Date(sample)) + 'Z') - sample;
    const candidate = nominal - offset;
    if (wall(new Date(candidate)) === target) candidates.add(candidate);
  }
  if (!candidates.size) throw new BusinessDateError('Local time does not exist in the restaurant timezone');
  return new Date(Math.min(...candidates));
}
