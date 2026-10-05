/**
 * Resource Engagement & Project Forecast — the pure date / capacity math.
 *
 * Shared by GET /api/engagement (which turns open tasks into engagement
 * blocks) and the /engagement page (which runs the what-if forecast in the
 * browser so ticking people re-computes instantly). No Prisma, no React:
 * everything here is plain data in, plain data out, and unit-tested in
 * __tests__/engagement.test.ts.
 *
 * Dates are ISO day strings ("YYYY-MM-DD") throughout. They compare
 * correctly as strings, and stepping them through UTC keeps the math free
 * of DST / timezone drift.
 */

export type Track = "Application" | "Plugin";
export const TRACKS: Track[] = ["Application", "Plugin"];

export function parseTrack(v: unknown): Track | null {
  return v === "Application" || v === "Plugin" ? v : null;
}

/** Roles whose people show on the engagement grid — the ones who do the
 *  work. Admins and BDs don't carry delivery tasks. */
export const ENGAGEMENT_ROLES = ["Developer", "Lead", "Coordinator"] as const;

/** Roles that can be staffed onto a forecast. */
export const FORECAST_ROLES = ["Developer", "Lead"] as const;

/** Project statuses whose open tasks count as engagement. On Hold work is
 *  paused and Delivered work is finished, so neither keeps anyone busy. */
export const ENGAGING_PROJECT_STATUSES = ["Discovery", "Active"] as const;

/* ------------------------------------------------------------------ dates */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today as an ISO day in the *local* timezone (browser side). */
export function localToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function dayOfWeek(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}

export function maxISO(a: string, b: string): string {
  return a > b ? a : b;
}

export function minISO(a: string, b: string): string {
  return a < b ? a : b;
}

/** "Mon,Tue,…" names from Settings → set of getUTCDay() numbers. Falls
 *  back to Mon–Fri when the setting is empty or unreadable. */
export function workingDaySet(names: string[]): Set<number> {
  const set = new Set(
    names.map((n) => WEEKDAY_INDEX[n.trim().slice(0, 3)]).filter((n) => n !== undefined),
  );
  return set.size ? set : new Set([1, 2, 3, 4, 5]);
}

export function isWorkingDay(iso: string, workDays: Set<number>): boolean {
  return workDays.has(dayOfWeek(iso));
}

/** The first working day on or after `iso`. */
export function nextWorkingDay(iso: string, workDays: Set<number>): string {
  let d = iso;
  for (let i = 0; i < 14 && !isWorkingDay(d, workDays); i++) d = addDays(d, 1);
  return d;
}

/** Working days in the inclusive range [from, to]. */
export function countWorkingDays(
  from: string,
  to: string,
  workDays: Set<number>,
): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWorkingDay(d, workDays)) n += 1;
  }
  return n;
}

/** "05 Oct 2026" — matches the rest of the app's en-GB date display. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* -------------------------------------------------------------- engagement */

/** One open task as the server sees it — only what engagement needs, no
 *  title or description. */
export type OpenTaskRow = {
  projectId: number;
  projectName: string;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
  estimatedHours: number | null;
  assigneeIds: string[];
};

/** A person's engagement on one project: the span covered by their open
 *  tasks there. */
export type EngagementBlock = {
  userId: string;
  projectId: number;
  projectName: string;
  start: string;
  end: string;
  openTasks: number;
  overdueTasks: number;
  /** This person's share of the open tasks' estimates. */
  remainingHours: number;
};

/** A forecast (what-if) span, drawn violet on the grid. */
export type ForecastBlock = {
  userId: string;
  projectId: number;
  projectName: string;
  start: string;
  end: string;
};

export type LeaveBlock = {
  userId: string;
  start: string;
  end: string;
  type: string;
};

/**
 * Collapse open tasks into one block per (person, project).
 *
 * A task runs from its start date (or the day it was created) to its
 * target date. An overdue task is still on the person's plate, so it
 * stretches to today; an undated task is assumed to run through today.
 */
export function buildEngagementBlocks(
  tasks: OpenTaskRow[],
  today: string,
): EngagementBlock[] {
  const byKey = new Map<string, EngagementBlock>();
  for (const t of tasks) {
    if (t.assigneeIds.length === 0) continue;
    const overdue = !!t.targetDate && t.targetDate < today;
    let start = t.startDate ?? t.createdAt;
    const end = !t.targetDate || overdue ? maxISO(today, start) : t.targetDate;
    if (start > end) start = end;
    const share = (t.estimatedHours ?? 0) / t.assigneeIds.length;
    for (const userId of t.assigneeIds) {
      const key = `${userId}:${t.projectId}`;
      const b = byKey.get(key);
      if (!b) {
        byKey.set(key, {
          userId,
          projectId: t.projectId,
          projectName: t.projectName,
          start,
          end,
          openTasks: 1,
          overdueTasks: overdue ? 1 : 0,
          remainingHours: share,
        });
      } else {
        b.start = minISO(b.start, start);
        b.end = maxISO(b.end, end);
        b.openTasks += 1;
        b.overdueTasks += overdue ? 1 : 0;
        b.remainingHours += share;
      }
    }
  }
  return [...byKey.values()].map((b) => ({
    ...b,
    remainingHours: Math.round(b.remainingHours * 10) / 10,
  }));
}

/** Blocks (of any kind) overlapping the inclusive range [from, to]. */
export function blocksIn<T extends { start: string; end: string }>(
  blocks: T[] | undefined,
  from: string,
  to: string,
): T[] {
  return (blocks ?? []).filter((b) => b.start <= to && b.end >= from);
}

/** First working day this person has nothing open — the day after their
 *  last engagement ends, or today if they're free already. */
export function freeFrom(
  blocks: { end: string }[] | undefined,
  today: string,
  workDays: Set<number>,
): string {
  const lastEnd = (blocks ?? []).reduce<string | null>(
    (m, b) => (m === null || b.end > m ? b.end : m),
    null,
  );
  if (!lastEnd || lastEnd < today) return nextWorkingDay(today, workDays);
  return nextWorkingDay(addDays(lastEnd, 1), workDays);
}

/* ---------------------------------------------------------------- forecast */

export type ForecastMember = {
  id: string;
  /** First day they can start on the forecast project. */
  from: string;
  hoursPerDay: number;
  /** Approved leave — no capacity on these days. */
  leaves?: { start: string; end: string }[];
};

export type ForecastResult = {
  /** Day the effort is used up, or null if it never is (no capacity). */
  endDate: string | null;
  /** Working days from start to finish. */
  days: number | null;
};

/** Safety stop: ~8 years of calendar days. */
const MAX_FORECAST_DAYS = 3000;

function onLeave(m: ForecastMember, day: string): boolean {
  return (m.leaves ?? []).some((l) => l.start <= day && l.end >= day);
}

/**
 * Walk forward from `start` one working day at a time, burning the
 * day's combined capacity of everyone who has joined (and isn't on
 * leave), until `effortHours` is used up.
 */
export function forecastFinish(
  effortHours: number,
  members: ForecastMember[],
  start: string,
  workDays: Set<number>,
): ForecastResult {
  if (effortHours <= 0) return { endDate: start, days: 0 };
  if (members.every((m) => m.hoursPerDay <= 0)) {
    return { endDate: null, days: null };
  }
  let left = effortHours;
  let days = 0;
  let day = start;
  for (let i = 0; i < MAX_FORECAST_DAYS; i++, day = addDays(day, 1)) {
    if (!isWorkingDay(day, workDays)) continue;
    days += 1;
    for (const m of members) {
      if (m.from <= day && !onLeave(m, day)) left -= m.hoursPerDay;
    }
    if (left <= 1e-9) return { endDate: day, days };
  }
  return { endDate: null, days: null };
}

/** Upper bound on the hire search — beyond this we just say "50+". */
export const MAX_HIRES = 50;

/**
 * Smallest number of extra people, joining on `start` at `hireHoursPerDay`,
 * that brings the finish on or before `target`. 0 when the current team
 * already makes it; null when even MAX_HIRES wouldn't.
 */
export function hiresNeeded(
  effortHours: number,
  members: ForecastMember[],
  start: string,
  target: string,
  workDays: Set<number>,
  hireHoursPerDay: number,
): number | null {
  if (hireHoursPerDay <= 0) return null;
  for (let extra = 0; extra <= MAX_HIRES; extra++) {
    const hires: ForecastMember[] = Array.from({ length: extra }, (_, i) => ({
      id: `hire-${i}`,
      from: start,
      hoursPerDay: hireHoursPerDay,
    }));
    const r = forecastFinish(effortHours, [...members, ...hires], start, workDays);
    if (r.endDate && r.endDate <= target) return extra;
  }
  return null;
}

export type ForecastSummary = {
  endDate: string | null;
  days: number | null;
  /** Members who actually contribute before the finish. */
  contributing: string[];
  freeNow: number;
  joiningLater: number;
  late: boolean;
  /** Hires to meet the target: a number, or "50+". */
  hires: number | "50+";
};

/** Everything the Forecast KPI row needs, in one call. */
export function summariseForecast(
  effortHours: number,
  members: ForecastMember[],
  start: string,
  target: string | null,
  workDays: Set<number>,
  hireHoursPerDay: number,
): ForecastSummary {
  const r = forecastFinish(effortHours, members, start, workDays);
  const contributing = members.filter(
    (m) => r.endDate === null || m.from <= r.endDate,
  );
  const late = !!target && (!r.endDate || r.endDate > target);
  const hires = late
    ? (hiresNeeded(effortHours, members, start, target!, workDays, hireHoursPerDay) ??
      "50+")
    : 0;
  return {
    endDate: r.endDate,
    days: r.days,
    contributing: contributing.map((m) => m.id),
    freeNow: contributing.filter((m) => m.from <= start).length,
    joiningLater: contributing.filter((m) => m.from > start).length,
    late,
    hires,
  };
}

/* ------------------------------------------------------------- grid periods */

export type Granularity = "weekly" | "monthly" | "yearly";

export type Period = {
  label: string;
  start: string;
  end: string;
  /** Header band the column belongs to (month name). */
  group: string;
  /** True for single-day columns that fall on a non-working day. */
  offDay: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthOf(iso: string): number {
  return Number(iso.slice(5, 7)) - 1;
}

/** Monday on or before `iso`. */
export function weekStart(iso: string): string {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7));
}

/** Move the anchor one page (week / month / year) back or forward. */
export function shiftAnchor(gran: Granularity, anchor: string, step: number): string {
  if (gran === "weekly") return addDays(anchor, 7 * step);
  const y = Number(anchor.slice(0, 4));
  const m = monthOf(anchor);
  if (gran === "monthly") {
    const d = new Date(Date.UTC(y, m + step, 1));
    return toISO(d);
  }
  return `${y + step}-01-01`;
}

export function periodLabel(gran: Granularity, anchor: string): string {
  if (gran === "weekly") {
    const s = weekStart(anchor);
    return `${fmtDay(s)} – ${fmtDay(addDays(s, 6))}`;
  }
  if (gran === "monthly") return `${MONTHS[monthOf(anchor)]} ${anchor.slice(0, 4)}`;
  return anchor.slice(0, 4);
}

export function periodsFor(
  gran: Granularity,
  anchor: string,
  workDays: Set<number>,
): Period[] {
  if (gran === "weekly") {
    const s = weekStart(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(s, i);
      return {
        label: `${DAYS[dayOfWeek(d)]} ${Number(d.slice(8, 10))}`,
        start: d,
        end: d,
        group: MONTHS[monthOf(d)],
        offDay: !isWorkingDay(d, workDays),
      };
    });
  }
  const y = Number(anchor.slice(0, 4));
  if (gran === "monthly") {
    const m = monthOf(anchor);
    const len = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Array.from({ length: len }, (_, i) => {
      const d = toISO(new Date(Date.UTC(y, m, i + 1)));
      return {
        label: String(i + 1),
        start: d,
        end: d,
        group: `${MONTHS[m]} ${y}`,
        offDay: !isWorkingDay(d, workDays),
      };
    });
  }
  // Yearly: 52 week columns starting 1 Jan.
  const out: Period[] = [];
  let s = `${y}-01-01`;
  for (let w = 1; w <= 52; w++) {
    out.push({
      label: w % 4 === 1 ? String(w) : "",
      start: s,
      end: addDays(s, 6),
      group: MONTHS[monthOf(s)],
      offDay: false,
    });
    s = addDays(s, 7);
  }
  return out;
}

/** Run-length groups for the header band: [{group, count}]. */
export function groupSpans(periods: Period[]): { group: string; count: number }[] {
  const out: { group: string; count: number }[] = [];
  for (const p of periods) {
    const last = out[out.length - 1];
    if (last && last.group === p.group) last.count += 1;
    else out.push({ group: p.group, count: 1 });
  }
  return out;
}
