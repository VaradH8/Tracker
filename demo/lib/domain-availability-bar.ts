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
  /**
   * True when nobody booked this window — the person simply holds
   * undelivered tags on the project, and the span is the project's own.
   *
   * Assigning tags is what makes somebody busy in practice, which is why
   * `status` has always counted it. The bar did not, so a person on two
   * projects with only one of them formally booked was drawn half free,
   * and the free-days figure beside them said so in numbers. Carried work
   * is drawn, and marked, so the two are not confused.
   */
  implied?: boolean;
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
  projects: { projectId: number; projectName: string; implied: boolean }[];
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
      implied: b.implied === true,
    }));
    // Booked and carried work on the same project are different states, so
    // the flag is part of the key — otherwise a booking that lapses into
    // carried tags would merge into one stretch and hide the handover.
    const stamp = (ps: Segment["projects"]) =>
      ps
        .map((x) => `${x.projectId}${x.implied ? "~" : ""}`)
        .sort()
        .join(",");
    const key = `${kind}:${stamp(projects)}`;

    const last = out[out.length - 1];
    const lastKey = last ? `${last.kind}:${stamp(last.projects)}` : null;

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

/* ------------------------------------------------------------------ */
/* Work carried without a booking                                      */
/* ------------------------------------------------------------------ */

/** A project somebody holds undelivered tags on but was never booked onto. */
export type CarriedWork = {
  projectId: number;
  projectName: string;
  openTags: number;
  startDate: string | null;
  handoverDate: string | null;
  workingDaysPerWeek: number | null;
};

/**
 * Turn carried work into spans the bar can draw.
 *
 * The window is the project's own: from its start, or today where it began
 * earlier, through to its handover date. That date is a real commitment —
 * the work has to be delivered by then — which is what makes it honest to
 * draw, unlike a guess at how long the tags will take.
 *
 * Work already past its handover is dropped rather than drawn in the past:
 * the bar starts at today, so it would render as nothing anyway, and
 * pretending it runs to today would invent a deadline nobody set.
 */
export function impliedBookings(
  carried: CarriedWork[],
  today: number,
): Booking[] {
  const out: Booking[] = [];
  for (const c of carried) {
    if (!c.handoverDate) continue;
    const end = dayNumber(c.handoverDate);
    if (end < today) continue;
    const declaredStart = c.startDate ? dayNumber(c.startDate) : today;
    const start = Math.max(today, Math.min(declaredStart, end));
    out.push({
      projectId: c.projectId,
      projectName: c.projectName,
      startDate: isoFromDay(start),
      endDate: isoFromDay(end),
      workingDaysPerWeek: c.workingDaysPerWeek,
      implied: true,
    });
  }
  return out;
}

/**
 * Carried work with no handover date, which cannot be placed on a
 * timeline at all.
 *
 * Returned so the caller can say so on the row. The alternative — drawing
 * it to the edge of the window — would claim a deadline nobody set, and
 * silently dropping it is the bug this whole path exists to fix.
 */
export function undatedCarriedWork(
  carried: CarriedWork[],
  today: number,
): CarriedWork[] {
  return carried.filter(
    (c) => !c.handoverDate || dayNumber(c.handoverDate) < today,
  );
}

/** Every distinct project on a run of segments, booked or carried. */
export function projectsOnBar(
  segments: Segment[],
): { projectId: number; projectName: string }[] {
  const seen = new Map<number, string>();
  for (const s of segments) {
    for (const p of s.projects) if (!seen.has(p.projectId)) seen.set(p.projectId, p.projectName);
  }
  return Array.from(seen.entries()).map(([projectId, projectName]) => ({
    projectId,
    projectName,
  }));
}
