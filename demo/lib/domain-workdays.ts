/**
 * Working-day arithmetic: turn "60 working days from 18 Aug" into a date.
 *
 * Kept as pure functions over ISO `yyyy-mm-dd` strings rather than Date
 * objects. A handover date is a calendar day, not an instant — the moment
 * it becomes a Date it acquires a timezone, and a date built in IST then
 * read in UTC lands on the previous day. Strings can't drift.
 *
 * Two things make a day non-working, and they are counted separately
 * because they are fixed by different people: the weekend comes from the
 * project's working week, holidays come from a list an Admin maintains.
 * Telling someone "8 weekend days and 2 holidays were skipped" lets them
 * check the answer; telling them "10 days were skipped" does not.
 */

/** Days worked per week. 5 = Mon–Fri, 6 = Mon–Sat. */
export const WORK_WEEKS = [5, 6] as const;
export type WorkWeek = (typeof WORK_WEEKS)[number];

export const DEFAULT_WORK_WEEK: WorkWeek = 5;

export function isWorkWeek(n: unknown): n is WorkWeek {
  return WORK_WEEKS.includes(n as WorkWeek);
}

/**
 * A project can't run past this many working days. Not a business rule —
 * a stop so a bad input (or a holiday list that swallows every day) can
 * never spin the loop below forever.
 */
export const MAX_WORKING_DAYS = 5000;

/** Day of week for an ISO date, 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** The next calendar day, as ISO. */
export function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Sunday is always off. Saturday is off only on a five-day week. */
export function isWeekend(iso: string, week: WorkWeek): boolean {
  const dow = dayOfWeek(iso);
  if (dow === 0) return true;
  return dow === 6 && week === 5;
}

export function isWorkingDay(
  iso: string,
  week: WorkWeek,
  holidays: ReadonlySet<string>,
): boolean {
  return !isWeekend(iso, week) && !holidays.has(iso);
}

export type HandoverResult = {
  /** The date the last working day falls on. */
  handover: string;
  /** The first day actually worked — `start`, or the next working day. */
  firstWorkingDay: string;
  weekendsSkipped: number;
  /** Holidays that fell on a day that would otherwise have been worked. */
  holidaysSkipped: number;
  /** Whole calendar days from `start` to `handover`, inclusive. */
  calendarDays: number;
};

/**
 * The date on which the `total`th working day falls, counting `start`
 * itself when it is a working day.
 *
 * So one working day beginning on a Monday finishes that same Monday —
 * consistent with `nthWorkingDay` in lib/forecast.ts, which the delivery
 * forecast already uses. A project quoted as "60 working days" must not
 * mean 59 in one screen and 60 in another.
 *
 * Returns null rather than throwing on unusable input: this runs on every
 * keystroke behind a live preview, where a half-typed date is normal and
 * an exception is not.
 */
export function handoverFrom(
  start: string,
  total: number,
  week: WorkWeek,
  holidays: ReadonlySet<string> = new Set(),
): HandoverResult | null {
  if (!isValidISODate(start)) return null;
  if (!Number.isInteger(total) || total < 1 || total > MAX_WORKING_DAYS) {
    return null;
  }

  let cursor = start;
  let worked = 0;
  let weekendsSkipped = 0;
  let holidaysSkipped = 0;
  let firstWorkingDay: string | null = null;
  let calendarDays = 1;

  // Bounded by construction: `total` is capped and a seven-day holiday
  // stretch still advances the cursor, so this cannot run away.
  const limit = MAX_WORKING_DAYS * 3;
  for (let step = 0; step < limit; step += 1) {
    if (isWeekend(cursor, week)) {
      weekendsSkipped += 1;
    } else if (holidays.has(cursor)) {
      // Counted only when it displaces work — a holiday on a Sunday costs
      // nobody a day, and reporting it as one invites an argument.
      holidaysSkipped += 1;
    } else {
      worked += 1;
      if (firstWorkingDay === null) firstWorkingDay = cursor;
      if (worked === total) {
        return {
          handover: cursor,
          firstWorkingDay,
          weekendsSkipped,
          holidaysSkipped,
          calendarDays,
        };
      }
    }
    cursor = nextDay(cursor);
    calendarDays += 1;
  }

  // Only reachable if every day in a decade-long window is non-working.
  return null;
}

/**
 * Working days in [from, to] inclusive — the inverse of the above, used
 * to show how much slack a hand-picked handover date leaves.
 */
export function workingDaysBetween(
  from: string,
  to: string,
  week: WorkWeek,
  holidays: ReadonlySet<string> = new Set(),
): number | null {
  if (!isValidISODate(from) || !isValidISODate(to)) return null;
  if (to < from) return 0;
  let count = 0;
  let cursor = from;
  for (let step = 0; step <= MAX_WORKING_DAYS * 3 && cursor <= to; step += 1) {
    if (isWorkingDay(cursor, week, holidays)) count += 1;
    cursor = nextDay(cursor);
  }
  return count;
}
