/**
 * Forecast math for the Domain module. Pure and dependency-free (no prisma,
 * no next/headers) so it can be imported from client components and unit
 * tested directly.
 *
 * Everything here counts in WORKING days (Mon–Fri). Dates are handled as
 * UTC-midnight day keys so arithmetic never drifts across a timezone.
 */

/** A working week — the divisor behind every "days needed" number. */
export const WORKING_DAYS_PER_WEEK = 5;

/** Rate assumed for someone with no approved history yet. Deliberately
 *  conservative: a new joiner shouldn't make a project look fast. */
export const DEFAULT_TAGS_PER_DAY = 8;

/** How far back we look when deriving a person's own rate. Older work
 *  doesn't say much about how fast they're going now. */
export const RATE_HISTORY_DAYS = 30;

export type ScheduleStatus = "On Track" | "Behind Schedule" | "Unknown";

/** Midnight UTC of the given date — the canonical day key. */
export function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function toISODate(d: Date): string {
  return dayStart(d).toISOString().slice(0, 10);
}

/** Mon–Fri. Saturday (6) and Sunday (0) are not working days. */
export function isWorkingDay(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** The `n`th working day on or after `from` (n = 1 means "the first working
 *  day, counting `from` itself if it's one"). Used for finish dates: work
 *  that takes 1 day and starts on a Monday finishes that Monday. */
export function nthWorkingDay(from: Date, n: number): Date {
  const cursor = dayStart(from);
  if (n < 1) return cursor;
  let remaining = n;
  while (true) {
    if (isWorkingDay(cursor)) {
      remaining -= 1;
      if (remaining === 0) return new Date(cursor);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/** The next working day on or after `from` — where new work can start. */
export function nextWorkingDay(from: Date): Date {
  return nthWorkingDay(from, 1);
}

/** Working days in [from, to], inclusive both ends. Returns a negative
 *  count when `to` falls before `from`, so it doubles as a slack measure:
 *  positive = spare days, negative = days late. */
export function workingDaysBetween(from: Date, to: Date): number {
  const a = dayStart(from);
  const b = dayStart(to);
  if (b.getTime() === a.getTime()) return isWorkingDay(a) ? 1 : 0;
  const backwards = b < a;
  const start = backwards ? b : a;
  const end = backwards ? a : b;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (isWorkingDay(cursor)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return backwards ? -count : count;
}

/**
 * A person's own tags/day, derived from what a Lead has actually approved.
 * `activeDays` is the number of distinct days they logged against, not the
 * calendar span — someone who delivered 40 tags across 4 working days runs
 * at 10/day even if those days were spread over a fortnight.
 *
 * Returns null when there's no history to go on; callers fall back to
 * DEFAULT_TAGS_PER_DAY via `effectiveRate`.
 */
export function personalRate(
  approvedTags: number,
  activeDays: number,
): number | null {
  if (activeDays <= 0 || approvedTags <= 0) return null;
  return Math.round((approvedTags / activeDays) * 100) / 100;
}

/** A usable rate for planning: the person's own if we have one, else the
 *  house default. */
export function effectiveRate(rate: number | null | undefined): number {
  return rate && rate > 0 ? rate : DEFAULT_TAGS_PER_DAY;
}

export type ForecastInput = {
  /** Tags still to deliver (assigned total minus approved deliveries). */
  remainingTags: number;
  /** Tags/day for each resource on the project. Empty = nobody allocated. */
  rates: number[];
  /** When the remaining work starts — normally today. */
  from: Date;
  /** The promised date, if the project has one. */
  handoverDate: Date | null;
};

export type ForecastResult = {
  /** Combined tags/day across everyone allocated. */
  dailyRate: number;
  /** Working days still needed at that rate. */
  workingDaysNeeded: number;
  /** Date the last tag lands, or null when it can't be computed. */
  projectedDate: string | null;
  status: ScheduleStatus;
  /** Working days of slack against the handover date: positive = spare,
   *  negative = late. Null when either date is missing. */
  slackDays: number | null;
  /** Why the status is what it is — surfaced in the UI so a Lead isn't
   *  left guessing at an "Unknown". */
  reason: string;
};

/**
 * Project a delivery date from remaining tags and the rates of the people
 * on the job, then compare it to the handover date.
 */
export function forecastDelivery(input: ForecastInput): ForecastResult {
  const { remainingTags, rates, from, handoverDate } = input;
  const dailyRate =
    Math.round(rates.reduce((sum, r) => sum + (r > 0 ? r : 0), 0) * 100) / 100;

  // Nothing left to do — the project is delivered.
  if (remainingTags <= 0) {
    const projected = toISODate(from);
    return {
      dailyRate,
      workingDaysNeeded: 0,
      projectedDate: projected,
      status: "On Track",
      slackDays: handoverDate ? workingDaysBetween(from, handoverDate) : null,
      reason: "All assigned tags are delivered.",
    };
  }

  // Work outstanding but nobody to do it: no honest date exists.
  if (dailyRate <= 0) {
    return {
      dailyRate: 0,
      workingDaysNeeded: 0,
      projectedDate: null,
      status: handoverDate ? "Behind Schedule" : "Unknown",
      slackDays: null,
      reason: "No resources allocated, so the remaining tags have no delivery date.",
    };
  }

  const workingDaysNeeded = Math.ceil(remainingTags / dailyRate);
  const projected = nthWorkingDay(nextWorkingDay(from), workingDaysNeeded);
  const projectedDate = toISODate(projected);

  if (!handoverDate) {
    return {
      dailyRate,
      workingDaysNeeded,
      projectedDate,
      status: "Unknown",
      slackDays: null,
      reason: "No handover date set, so there's nothing to measure against.",
    };
  }

  // Slack counts the gap between the projected finish and the promise.
  // Same day = 0 days spare, which still counts as on track.
  const slackDays = workingDaysBetween(projected, handoverDate) - 1;
  const onTrack = dayStart(projected) <= dayStart(handoverDate);
  return {
    dailyRate,
    workingDaysNeeded,
    projectedDate,
    status: onTrack ? "On Track" : "Behind Schedule",
    slackDays,
    reason: onTrack
      ? `${remainingTags} tags at ${dailyRate}/day finishes ${slackDays} working day(s) before handover.`
      : `${remainingTags} tags at ${dailyRate}/day overruns handover by ${Math.abs(slackDays)} working day(s).`,
  };
}

/** Do two date windows touch at all? Both ends inclusive. */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return dayStart(aStart) <= dayStart(bEnd) && dayStart(bStart) <= dayStart(aEnd);
}

/**
 * The date a resource frees up: the day after the latest allocation they're
 * committed to ends (or the release date, where a Lead let them go early).
 * Null when they hold no allocations — they're free now.
 */
export function availableFrom(
  allocations: { endDate: Date; releasedAt: Date | null }[],
): Date | null {
  if (allocations.length === 0) return null;
  const ends = allocations.map((a) =>
    dayStart(a.releasedAt ?? a.endDate).getTime(),
  );
  const last = new Date(Math.max(...ends));
  last.setUTCDate(last.getUTCDate() + 1);
  return nextWorkingDay(last);
}
