/** Dates are local calendar dates as `YYYY-MM-DD` strings, never instants. */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function formatUtc(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

function parseUtc(date: string): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid date "${date}"; expected YYYY-MM-DD.`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  return formatUtc(parseUtc(value)) === value;
}

export function todayLocal(now: Date = new Date()): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

/** Moves a date by calendar fields, so daylight-saving changes cannot shift it. */
export function addDays(date: string, n: number): string {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid date "${date}"; expected YYYY-MM-DD.`);
  return formatUtc(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + n));
}

/** Whole calendar days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseUtc(b) - parseUtc(a)) / MS_PER_DAY);
}

export function dueDate(startDate: string, day: number): string {
  return addDays(startDate, day - 1);
}

/** Calendar days past the due date of `day`; 0 when it is due today or later. */
export function daysBehind(startDate: string, day: number, today: string): number {
  return Math.max(0, daysBetween(dueDate(startDate, day), today));
}

/** The start date that makes `day` due on `today`. */
export function shiftedStartDate(day: number, today: string): string {
  return addDays(today, -(day - 1));
}
