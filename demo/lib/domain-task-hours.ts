/**
 * How long a task is worth, and how long it took.
 *
 * A due date on its own says when, not how much, so two tasks a fortnight
 * apart look identical on a list however different the work is. Turning
 * the gap into hours gives the assigner a figure to sanity-check against —
 * "three days for this?" is a question you can only ask once the three
 * days has a number attached.
 *
 * Nine hours a day. Weekends are excluded by default — a task handed out
 * on Friday and due Monday is one day's work, not three, and counting the
 * weekend would quietly promise a Saturday. The assigner can say the
 * weekend is being worked, and then it counts; what they cannot do is
 * have it counted without saying so.
 */
export const HOURS_PER_DAY = 9;

/**
 * The hours between handing a task over and it being due.
 *
 * Counted as the GAP, not the span: assigned Monday, due Thursday is three
 * days and twenty-seven hours — the days there are to do it in, not the
 * number of dates involved.
 *
 * A suggestion, not a rule. It fills the estimate in when the dates are
 * set and the assigner can type over it, or set hours with no dates at
 * all — plenty of tasks are two hours inside a week-long window, and
 * plenty have no deadline worth naming.
 */
export function budgetedHours(
  start: Date | string | null,
  due: Date | string | null,
  includeWeekends = false,
): number | null {
  const span = daySpan(start, due);
  if (span === null) return null;
  return span.days(includeWeekends) * HOURS_PER_DAY;
}

/**
 * The days a task covers, and which of them are a weekend.
 *
 * One helper for both questions because they have to agree. The banner
 * says "this crosses Sat 29 and Sun 30" and the hours box says 45 rather
 * than 27; if those were computed separately they would drift the first
 * time somebody changed the convention in one place.
 *
 * The span is the days AFTER the assign date up to and including the due
 * date — the days there are to do the work in. Assigned Friday, due
 * Monday is Sat, Sun, Mon: three days if you are working the weekend, one
 * if you are not.
 */
export function daySpan(
  start: Date | string | null,
  due: Date | string | null,
): {
  /** Every weekend date in the span, as ISO days, in order. */
  weekend: string[];
  /** Calendar days if weekends count, working days if they don't. */
  days: (includeWeekends: boolean) => number;
  calendarDays: number;
  workingDays: number;
} | null {
  if (!start || !due) return null;
  const a = start instanceof Date ? dayUTC(start) : parseISO(start);
  const b = due instanceof Date ? dayUTC(due) : parseISO(due);
  if (!a || !b || b < a) return null;

  const weekend: string[] = [];
  let working = 0;
  const cursor = new Date(a);
  // From the day after the assign date: the assign date itself is when the
  // work was handed over, not a day spent on it. This is the same "gap,
  // not span" convention the estimate has always used.
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= b) {
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) weekend.push(cursor.toISOString().slice(0, 10));
    else working += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const calendarDays = Math.round((b.getTime() - a.getTime()) / 86400000);

  return {
    weekend,
    calendarDays,
    workingDays: working,
    /**
     * Floored at one day. A task assigned and due the same day is a day's
     * work, and a Saturday-to-Sunday weekday-only task is not zero hours —
     * it is somebody being asked to fit it in, which is one day.
     */
    days: (includeWeekends: boolean) =>
      Math.max(1, includeWeekends ? calendarDays : working),
  };
}

function dayUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function parseISO(s: string): Date | null {
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sat 29, Sun 30" — for the banner, short enough to sit on one line. */
export function weekendLabel(days: string[]): string {
  const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days
    .map((iso) => {
      const d = new Date(`${iso}T00:00:00Z`);
      return `${NAMES[d.getUTCDay()]} ${d.getUTCDate()}`;
    })
    .join(", ");
}

/**
 * Hours somebody reports having spent.
 *
 * Optional — plenty of work gets done without anybody timing it, and
 * refusing a submission for want of a number would only teach people to
 * type one in. Bounded because a four-figure entry on one task is a
 * slipped decimal point, not a fortnight at the desk.
 */
export const MAX_HOURS_SPENT = 500;

export function hoursSpentIssue(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Hours has to be a number.";
  if (n <= 0) return "Hours has to be more than 0.";
  if (n > MAX_HOURS_SPENT) {
    return `${n} hours on one task looks like a typo — the most you can log is ${MAX_HOURS_SPENT}.`;
  }
  // Quarter hours: finer than that is false precision on a figure being
  // typed from memory at the end of a day.
  if (Math.round(n * 4) !== n * 4) {
    return "Use quarter hours — 2, 2.25, 2.5 and so on.";
  }
  return null;
}

export function parseHoursSpent(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** "27h budgeted · 19h spent · 8h under" — the whole story in one line. */
export function hoursVariance(
  budget: number | null,
  spent: number | null,
): { over: boolean; by: number } | null {
  if (budget === null || spent === null) return null;
  const diff = Math.round((spent - budget) * 100) / 100;
  return { over: diff > 0, by: Math.abs(diff) };
}
