/**
 * One person's next few months, as a run of segments.
 *
 * The board used to draw a floating bar per booking on a shared axis, one
 * lane each. That answers "when is this booking" and not the question the
 * screen exists for — how much of this person's time is actually spoken
 * for, and where the gaps are. Stacked lanes also made two people
 * impossible to compare, because their rows were different heights.
 *
 * So: every person gets the same rectangle, filled end to end. Each
 * WORKING day is either committed to a project or free, and consecutive
 * days in the same state merge into a segment. A gap you could put work
 * into is drawn as a gap, not as absence of a bar.
 *
 * Non-working days take no width at all. The bar is a picture of capacity,
 * and a Sunday is not capacity — drawn to scale it padded every row with
 * two-sevenths of nothing, and made a five-day project and a six-day one
 * look equally committed over the same fortnight when one of them is
 * plainly busier. Excluded outright, the width of a bar IS the working
 * time it covers, and two people can be compared by eye.
 *
 * Which days those are comes from each project's own working week, because
 * a five-day project and a six-day one do not share their Saturdays. On a
 * day nobody has booked there is no project to ask, so a five-day week is
 * assumed — the common case, and the conservative one: it counts fewer
 * days as free rather than more.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the epoch, in UTC, for an ISO date. */
export function dayNumber(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
}

export function isoFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: number): number {
  return new Date(day * DAY_MS).getUTCDay();
}

export const DEFAULT_WORK_WEEK = 5;

/**
 * Whether this is a working day on a `perWeek`-day week.
 *
 * Five days is Monday to Friday; six adds Saturday. Sunday is never a
 * working day — no project in this system has ever declared a seven-day
 * week, and the field only accepts 5 or 6.
 */
export function isWorkingDay(day: number, perWeek: number): boolean {
  const d = weekday(day);
  if (d === 0) return false;
  if (d === 6) return perWeek >= 6;
  return true;
}

export type Booking = {
  projectId: number;
  projectName: string;
  startDate: string;
  endDate: string;
  releasedAt?: string | null;
  workingDaysPerWeek?: number | null;
};

export type Segment = {
  /**
   * First and last working day in the segment.
   *
   * The calendar days between them can include a weekend — a stretch
   * running Friday to Monday reads "21/08 – 24/08" — because those are the
   * dates somebody is actually committed for. It is only the width that
   * ignores the days nobody works.
   */
  from: number;
  to: number;
  /** Working days, which is both the width and the count. */
  workingDays: number;
  kind: "busy" | "free";
  /** Projects covering this stretch. More than one means double-booked. */
  projects: { projectId: number; projectName: string }[];
};

/** Bookings covering a given day, released ones ending when they were released. */
function coveringOn(day: number, bookings: Booking[]): Booking[] {
  return bookings.filter((b) => {
    const from = dayNumber(b.startDate);
    const to = dayNumber(b.releasedAt ?? b.endDate);
    return day >= from && day <= to;
  });
}

/**
 * Walk the window one day at a time and merge equal neighbours.
 *
 * Day-by-day rather than by interval because the three states interleave:
 * a booking can run across a weekend, so "busy" and "off" alternate inside
 * one booking, and two bookings can start mid-week against each other.
 * Merging afterwards is simpler to get right than intersecting intervals,
 * and the windows here are months, not decades.
 */
export function buildSegments(
  from: number,
  to: number,
  bookings: Booking[],
): Segment[] {
  const out: Segment[] = [];
  if (to < from) return out;

  for (let day = from; day <= to; day++) {
    const covering = coveringOn(day, bookings);

    // A booked day follows its own project's week; a free one has no
    // project to ask, so it falls back to the ordinary five.
    const perWeek =
      covering.length > 0
        ? Math.max(
            ...covering.map((b) => b.workingDaysPerWeek ?? DEFAULT_WORK_WEEK),
          )
        : DEFAULT_WORK_WEEK;

    // Not a working day: no width, no count, and it does not break a
    // stretch either — Friday and Monday on the same project are one
    // segment, because the weekend between them is not a change of state.
    if (!isWorkingDay(day, perWeek)) continue;

    const kind: Segment["kind"] = covering.length > 0 ? "busy" : "free";
    const projects = covering.map((b) => ({
      projectId: b.projectId,
      projectName: b.projectName,
    }));
    const key = `${kind}:${projects.map((p) => p.projectId).sort().join(",")}`;

    const last = out[out.length - 1];
    const lastKey = last
      ? `${last.kind}:${last.projects.map((p) => p.projectId).sort().join(",")}`
      : null;

    if (last && lastKey === key) {
      last.to = day;
      last.workingDays += 1;
    } else {
      out.push({ from: day, to: day, workingDays: 1, kind, projects });
    }
  }
  return out;
}

/** Working days in the window, and so the width the bar divides up. */
export function totalWorkingDays(segments: Segment[]): number {
  return Math.max(
    1,
    segments.reduce((n, s) => n + s.workingDays, 0),
  );
}

/** Working days in the window with nothing booked against them. */
export function freeWorkingDays(segments: Segment[]): number {
  return segments
    .filter((s) => s.kind === "free")
    .reduce((n, s) => n + s.workingDays, 0);
}

/**
 * A stable colour index per project, so the same job is the same colour on
 * every row of the chart.
 *
 * Sorted by name rather than by id so the assignment does not shuffle when
 * a project is added — the palette stays put for the projects already on
 * screen.
 */
export function colourIndexes(
  bookings: { projectId: number; projectName: string }[],
): Map<number, number> {
  const seen = new Map<number, string>();
  for (const b of bookings) {
    if (!seen.has(b.projectId)) seen.set(b.projectId, b.projectName);
  }
  const sorted = Array.from(seen.entries()).sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  return new Map(sorted.map(([id], i) => [id, i]));
}
