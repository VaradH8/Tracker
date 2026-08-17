/**
 * Server-side forecast queries for the Domain module: turns rows in the
 * database into the numbers `lib/forecast.ts` reasons about. Kept apart
 * from that file so the pure math stays importable on the client.
 */

import { prisma } from "./db";
import {
  RATE_HISTORY_DAYS,
  availableFrom,
  effectiveRate,
  forecastDelivery,
  personalRate,
  rangesOverlap,
  splitRate,
  toISODate,
  type ForecastResult,
} from "./forecast";
import { TAG_HOLDER_ROLES } from "./domain";

/**
 * Tags/day for each person, derived from what Leads have actually approved
 * in the last RATE_HISTORY_DAYS. Attribution follows the assignment's
 * assignee (the person the tags belong to), not whoever typed the
 * submission. People with no approved history map to null — callers run
 * that through `effectiveRate` to get the house default.
 */
export type MeasuredRate = {
  rate: number | null;
  /** Approved tags behind the figure, so the UI can show its basis. */
  tags: number;
  /** Distinct days worked — the divisor. */
  days: number;
};

/**
 * The same tally as `ratesByUser`, keeping the evidence alongside the
 * number. The availability screen reports a measured average, and a
 * measurement that can't say what it was measured from is just an
 * assertion.
 */
async function measuredRatesByUser(): Promise<Map<string, MeasuredRate>> {
  const since = new Date(Date.now() - RATE_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const approved = await prisma.domainTagSubmission.findMany({
    where: { status: "Approved", date: { gte: since } },
    select: {
      date: true,
      approvedCount: true,
      completedCount: true,
      assignment: { select: { assigneeId: true } },
    },
  });

  const tally = new Map<string, { tags: number; days: Set<string> }>();
  for (const s of approved) {
    const userId = s.assignment.assigneeId;
    const count = s.approvedCount ?? s.completedCount;
    if (count <= 0) continue;
    const entry = tally.get(userId) ?? { tags: 0, days: new Set<string>() };
    entry.tags += count;
    entry.days.add(toISODate(s.date));
    tally.set(userId, entry);
  }

  const out = new Map<string, MeasuredRate>();
  for (const [userId, { tags, days }] of tally) {
    out.set(userId, {
      rate: personalRate(tags, days.size),
      tags,
      days: days.size,
    });
  }
  return out;
}

/**
 * Just the rate, for callers that don't need the evidence behind it.
 * Derived from `measuredRatesByUser` rather than repeating the query —
 * two copies of this tally would eventually disagree, and a forecast that
 * disagrees with the availability screen about someone's speed is worse
 * than either being wrong on its own.
 */
async function ratesByUser(): Promise<Map<string, number | null>> {
  const measured = await measuredRatesByUser();
  return new Map(Array.from(measured, ([id, m]) => [id, m.rate]));
}

export type ResourceForecast = {
  id: string;
  name: string;
  /** Two people can share a display name; the email is what tells them
   *  apart, so every screen listing people can disambiguate. */
  email: string;
  role: string;
  /** Tags/day from approved history, or null when they have none yet. */
  rate: number | null;
  /**
   * Purely observed: approved tags per working day over the recent window,
   * null until there is approved work to measure. Never falls back to an
   * estimate or a house default — this is the number the availability
   * screen reports, and it has to be real or absent.
   */
  measuredRate: number | null;
  /** Approved tags and days behind `measuredRate`. Zero when unmeasured. */
  approvedTags: number;
  measuredDays: number;
  /** The rate actually used in projections (falls back to the default). */
  effectiveRate: number;
  usingDefaultRate: boolean;
  /** measured = from approved work · expected = a Lead's estimate ·
   *  default = the house fallback. */
  rateSource: "measured" | "expected" | "default";
  projects: {
    projectId: number;
    projectName: string;
    startDate: string;
    endDate: string;
    releasedAt: string | null;
    assignedTags: number;
    deliveredTags: number;
  }[];
  /** Tags assigned to them and not yet delivered, across every project. */
  openTags: number;
  /** Projects they hold open tags on without a booking window. */
  openTagProjects: { projectId: number; projectName: string; openTags: number }[];
  /**
   * ISO date they next free up. Null means no booking is holding them —
   * which is only the same as "free now" when `openTags` is 0 too.
   */
  availableFrom: string | null;
  status: "Free" | "Allocated";
};

/**
 * Everyone who does hands-on work, with the projects they're booked on,
 * each booking's window, and the date they come free.
 */
export async function resourceForecast(): Promise<ResourceForecast[]> {
  const [people, rates] = await Promise.all([
    prisma.domainUser.findMany({
      where: { isActive: true, role: { in: TAG_HOLDER_ROLES } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        expectedTagsPerDay: true,
      },
    }),
    measuredRatesByUser(),
  ]);

  const allocations = await prisma.domainAllocation.findMany({
    include: { project: { select: { id: true, name: true } } },
    orderBy: { startDate: "asc" },
  });

  // Tag totals per person per project, so a row can show what the booking
  // is actually carrying rather than just its dates.
  const assignments = await prisma.domainTagAssignment.groupBy({
    by: ["assigneeId", "projectId"],
    _sum: { assignedCount: true, deliveredCount: true },
  });
  const tagsBy = new Map(
    assignments.map((a) => [
      `${a.assigneeId}:${a.projectId}`,
      {
        assigned: a._sum.assignedCount ?? 0,
        delivered: a._sum.deliveredCount ?? 0,
      },
    ]),
  );

  // groupBy can't join, and tags may point at a project the person has no
  // allocation for, so names come from a separate lookup.
  const projectNames = new Map(
    (
      await prisma.domainProject.findMany({ select: { id: true, name: true } })
    ).map((p) => [p.id, p.name]),
  );

  return people.map((p) => {
    const mine = allocations.filter((a) => a.userId === p.id);
    const evidence = rates.get(p.id);
    const measured = evidence?.rate ?? null;

    // Everything they still owe, whether or not it sits inside a booking.
    const myTags = assignments.filter((a) => a.assigneeId === p.id);
    const openOf = (a: (typeof assignments)[number]) =>
      Math.max(0, (a._sum.assignedCount ?? 0) - (a._sum.deliveredCount ?? 0));
    const openTags = myTags.reduce((s, a) => s + openOf(a), 0);

    // Tags held on a project they were never formally booked onto. Without
    // this the detail panel would call them busy and then list nothing.
    const bookedOn = new Set(mine.map((a) => a.projectId));
    const openOnly = myTags
      .filter((a) => !bookedOn.has(a.projectId) && openOf(a) > 0)
      .map((a) => ({
        projectId: a.projectId,
        projectName: projectNames.get(a.projectId) ?? "Unknown project",
        openTags: openOf(a),
      }));
    // Measured history wins; a Lead's expectation covers the gap until
    // there is any; the house default is the last resort.
    const rate = measured ?? p.expectedTagsPerDay ?? null;
    const free = availableFrom(
      mine.map((a) => ({ endDate: a.endDate, releasedAt: a.releasedAt })),
    );
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      rate,
      measuredRate: measured,
      approvedTags: evidence?.tags ?? 0,
      measuredDays: evidence?.days ?? 0,
      effectiveRate: effectiveRate(rate),
      usingDefaultRate: rate === null,
      /** Where the number came from, so the UI never passes off an
       *  assumption as a measurement. */
      rateSource:
        measured !== null
          ? ("measured" as const)
          : p.expectedTagsPerDay
            ? ("expected" as const)
            : ("default" as const),
      projects: mine.map((a) => {
        const tags = tagsBy.get(`${p.id}:${a.projectId}`);
        return {
          projectId: a.projectId,
          projectName: a.project.name,
          startDate: toISODate(a.startDate),
          endDate: toISODate(a.endDate),
          releasedAt: a.releasedAt ? toISODate(a.releasedAt) : null,
          assignedTags: tags?.assigned ?? 0,
          deliveredTags: tags?.delivered ?? 0,
        };
      }),
      openTags,
      openTagProjects: openOnly,
      availableFrom: free ? toISODate(free) : null,
      /**
       * Free means free: nothing booked AND no tags outstanding. Tags can
       * be assigned without a booking window — assigning them is what
       * makes someone busy in practice — so a status derived from
       * allocations alone showed people as available while they were
       * sitting on undelivered work.
       */
      status: mine.length === 0 && openTags === 0 ? "Free" : "Allocated",
    };
  });
}

export type ProjectForecast = {
  id: number;
  name: string;
  owner: string;
  startDate: string | null;
  handoverDate: string | null;
  /** The whole deliverable: the project's declared total, or the sum of
   *  what's been assigned when no total was set. */
  totalTags: number;
  assignedTags: number;
  deliveredTags: number;
  remainingTags: number;
  pendingApprovalTags: number;
  divisions: { id: number; name: string; totalTags: number; assignedTags: number; deliveredTags: number }[];
  resources: {
    id: string;
    name: string;
    /** What this project actually gets: the full rate divided by however
     *  many overlapping projects the person is booked on. */
    rate: number;
    /** Their undivided rate, before any sharing. */
    fullRate: number;
    /** How many overlapping projects they're split across (1 = undivided). */
    concurrentProjects: number;
    usingDefaultRate: boolean;
  }[];
  /** The date the projection counts from — today, unless the project is
   *  staffed from a later date. */
  startsFrom: string;
  /** How many people actually hold tags on this project. */
  peopleEngaged: number;
  forecast: ForecastResult;
};

/**
 * Forecast every project (or one, when `projectId` is given).
 *
 * Rates come from the people booked onto the project. Where a Lead has
 * assigned tags without formally allocating anyone, we fall back to the
 * assignees themselves — otherwise a project with visible work in flight
 * would report "no resources".
 */
export async function projectForecasts(
  projectId?: number,
): Promise<ProjectForecast[]> {
  const projects = await prisma.domainProject.findMany({
    where: projectId ? { id: projectId } : undefined,
    include: {
      owner: { select: { name: true } },
      divisions: { include: { division: { select: { id: true, name: true } } } },
      allocations: {
        include: { user: { select: { id: true, name: true } } },
      },
      tagAssignments: {
        include: {
          assignee: { select: { id: true, name: true } },
          division: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rates = await ratesByUser();
  const expected = new Map(
    (
      await prisma.domainUser.findMany({
        select: { id: true, expectedTagsPerDay: true },
      })
    ).map((u) => [u.id, u.expectedTagsPerDay]),
  );
  const now = new Date();

  // Every booking in the system, so a person's rate can be shared across
  // the projects they're on at the same time. Fetched once and grouped,
  // rather than re-queried per project.
  const allAllocations = await prisma.domainAllocation.findMany({
    select: {
      userId: true,
      projectId: true,
      startDate: true,
      endDate: true,
      releasedAt: true,
    },
  });
  const allocationsByUser = new Map<string, typeof allAllocations>();
  for (const a of allAllocations) {
    const list = allocationsByUser.get(a.userId) ?? [];
    list.push(a);
    allocationsByUser.set(a.userId, list);
  }

  // Claimed-but-not-yet-approved tags, so a Lead can see what's sitting in
  // the review queue against each project.
  const pending = await prisma.domainTagSubmission.groupBy({
    by: ["assignmentId"],
    where: { status: "Pending" },
    _sum: { completedCount: true },
  });
  const pendingBy = new Map(
    pending.map((p) => [p.assignmentId, p._sum.completedCount ?? 0]),
  );

  return projects.map((p) => {
    const assignedTags = p.tagAssignments.reduce((s, a) => s + a.assignedCount, 0);
    const deliveredTags = p.tagAssignments.reduce((s, a) => s + a.deliveredCount, 0);
    const pendingApprovalTags = p.tagAssignments.reduce(
      (s, a) => s + (pendingBy.get(a.id) ?? 0),
      0,
    );
    const totalTags = p.totalTags > 0 ? p.totalTags : assignedTags;
    const remainingTags = Math.max(0, totalTags - deliveredTags);

    // Work can't start before the people do. When every booking on the
    // project is still in the future, the projection runs from the first
    // start date rather than today — otherwise a project staffed from next
    // month would claim it delivers this week.
    const starts = p.allocations.map((a) => a.startDate.getTime());
    const earliestStart = starts.length > 0 ? new Date(Math.min(...starts)) : null;
    const from = earliestStart && earliestStart > now ? earliestStart : now;

    // A rate set on the booking is the Lead saying "on THIS project, expect
    // N/day" — more specific than a cross-project average, so it wins.
    const perProjectRate = new Map(
      p.allocations
        .filter((a) => a.expectedTagsPerDay != null)
        .map((a) => [a.userId, a.expectedTagsPerDay as number]),
    );

    // Who's on the job: the formal allocations, else whoever holds tags.
    const allocated = p.allocations.map((a) => a.user);
    const fromAssignments = Array.from(
      new Map(p.tagAssignments.map((a) => [a.assignee.id, a.assignee])).values(),
    );
    const people = allocated.length > 0 ? allocated : fromAssignments;

    // The stretch this project's delivery actually spans. Used to decide
    // which of a person's other bookings genuinely compete with this one.
    const allocEnds = p.allocations.map((a) =>
      (a.releasedAt ?? a.endDate).getTime(),
    );
    const windowEnd =
      p.handoverDate ??
      (allocEnds.length > 0 ? new Date(Math.max(...allocEnds)) : from);

    /** How many overlapping projects this person is split across. Always
     *  at least 1 — someone holding tags without a formal booking still
     *  counts as working on this one. */
    const concurrentFor = (userId: string): number => {
      const overlapping = (allocationsByUser.get(userId) ?? []).filter((a) =>
        rangesOverlap(from, windowEnd, a.startDate, a.releasedAt ?? a.endDate),
      );
      return Math.max(1, overlapping.length);
    };

    const resources = people.map((u) => {
      const r =
        perProjectRate.get(u.id) ??
        rates.get(u.id) ??
        expected.get(u.id) ??
        null;
      const fullRate = effectiveRate(r);
      const concurrentProjects = concurrentFor(u.id);
      return {
        id: u.id,
        name: u.name,
        rate: splitRate(fullRate, concurrentProjects),
        fullRate,
        concurrentProjects,
        usingDefaultRate: r === null,
      };
    });

    const divisions = p.divisions.map((pd) => {
      const forDivision = p.tagAssignments.filter(
        (a) => a.divisionId === pd.divisionId,
      );
      return {
        id: pd.division.id,
        name: pd.division.name,
        totalTags: pd.totalTags,
        assignedTags: forDivision.reduce((s, a) => s + a.assignedCount, 0),
        deliveredTags: forDivision.reduce((s, a) => s + a.deliveredCount, 0),
      };
    });

    return {
      id: p.id,
      name: p.name,
      owner: p.owner.name,
      startDate: p.startDate ? toISODate(p.startDate) : null,
      handoverDate: p.handoverDate ? toISODate(p.handoverDate) : null,
      totalTags,
      assignedTags,
      deliveredTags,
      remainingTags,
      pendingApprovalTags,
      divisions,
      resources,
      /** When the projection starts counting from — today, unless the
       *  project is staffed from a later date. */
      startsFrom: toISODate(from),
      peopleEngaged: new Set(p.tagAssignments.map((a) => a.assigneeId)).size,
      forecast: forecastDelivery({
        remainingTags,
        rates: resources.map((r) => r.rate),
        from,
        handoverDate: p.handoverDate,
      }),
    };
  });
}

export type AllocationConflict = {
  projectId: number;
  projectName: string;
  startDate: string;
  endDate: string;
  availableFrom: string;
};

/**
 * Bookings that clash with a proposed window for one person. Feeds the
 * "already allocated" prompt: which projects, over what dates, and when
 * they actually come free.
 */
export async function allocationConflicts(
  userId: string,
  startDate: Date,
  endDate: Date,
  excludeProjectId?: number,
): Promise<AllocationConflict[]> {
  const existing = await prisma.domainAllocation.findMany({
    where: {
      userId,
      ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
    },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { startDate: "asc" },
  });

  return existing
    .filter((a) =>
      rangesOverlap(startDate, endDate, a.startDate, a.releasedAt ?? a.endDate),
    )
    .map((a) => {
      const free = availableFrom([
        { endDate: a.endDate, releasedAt: a.releasedAt },
      ])!;
      return {
        projectId: a.project.id,
        projectName: a.project.name,
        startDate: toISODate(a.startDate),
        endDate: toISODate(a.releasedAt ?? a.endDate),
        availableFrom: toISODate(free),
      };
    });
}

export type DeliveryEntry = {
  submissionId: number;
  assigneeId: string;
  assigneeName: string;
  /** What the Lead actually signed off, which may be under what was claimed. */
  count: number;
  claimed: number;
  approvedBy: string | null;
  approvedAt: string | null;
  note: string | null;
};

export type DeliveryDay = {
  date: string;
  total: number;
  divisions: {
    divisionId: number | null;
    divisionName: string;
    total: number;
    entries: DeliveryEntry[];
  }[];
};

export type DivisionRate = {
  divisionId: number | null;
  divisionName: string;
  totalTags: number;
  delivered: number;
  remaining: number;
  /** Distinct days this division has had work approved on. */
  activeDays: number;
  /** Delivered ÷ active days — the division's measured pace. */
  perDay: number;
};

/**
 * The delivery record behind a project's forecast: what was approved, on
 * which day, in which division, by which actionee, and who signed it off.
 *
 * Only Approved submissions count. A claim awaiting review has not been
 * delivered, so it neither appears here nor moves a rate — the same rule
 * the rest of the forecast follows.
 */
export async function projectDeliveries(projectId: number): Promise<{
  days: DeliveryDay[];
  divisionRates: DivisionRate[];
  peopleEngaged: { id: string; name: string; delivered: number }[];
}> {
  const [project, approved] = await Promise.all([
    prisma.domainProject.findUnique({
      where: { id: projectId },
      include: {
        divisions: { include: { division: { select: { id: true, name: true } } } },
        tagAssignments: {
          include: {
            assignee: { select: { id: true, name: true } },
            division: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.domainTagSubmission.findMany({
      where: { status: "Approved", assignment: { projectId } },
      include: {
        assignment: {
          include: {
            assignee: { select: { id: true, name: true } },
            division: { select: { id: true, name: true } },
          },
        },
        reviewedBy: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { reviewedAt: "desc" }],
    }),
  ]);

  if (!project) return { days: [], divisionRates: [], peopleEngaged: [] };

  const countOf = (s: (typeof approved)[number]) =>
    s.approvedCount ?? s.completedCount;

  // --- day → division → entries -------------------------------------
  const byDay = new Map<string, Map<string, DeliveryDay["divisions"][number]>>();
  for (const s of approved) {
    const n = countOf(s);
    if (n <= 0) continue;
    const date = toISODate(s.date);
    const divId = s.assignment.division?.id ?? null;
    const divName = s.assignment.division?.name ?? "No division";
    const key = String(divId);

    const dayMap = byDay.get(date) ?? new Map();
    const bucket =
      dayMap.get(key) ??
      { divisionId: divId, divisionName: divName, total: 0, entries: [] };
    bucket.total += n;
    bucket.entries.push({
      submissionId: s.id,
      assigneeId: s.assignment.assignee.id,
      assigneeName: s.assignment.assignee.name,
      count: n,
      claimed: s.completedCount,
      approvedBy: s.reviewedBy?.name ?? null,
      approvedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
      note: s.reviewNote,
    });
    dayMap.set(key, bucket);
    byDay.set(date, dayMap);
  }

  const days: DeliveryDay[] = Array.from(byDay, ([date, divMap]) => {
    const divisions = Array.from(divMap.values()).sort(
      (a, b) => b.total - a.total,
    );
    return {
      date,
      total: divisions.reduce((s, d) => s + d.total, 0),
      divisions,
    };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));

  // --- per-division pace ---------------------------------------------
  const divDelivered = new Map<string, { tags: number; days: Set<string> }>();
  for (const s of approved) {
    const n = countOf(s);
    if (n <= 0) continue;
    const key = String(s.assignment.division?.id ?? null);
    const e = divDelivered.get(key) ?? { tags: 0, days: new Set<string>() };
    e.tags += n;
    e.days.add(toISODate(s.date));
    divDelivered.set(key, e);
  }

  // Every division the project declares, plus any the work actually used.
  const declared = project.divisions.map((d) => ({
    divisionId: d.division.id as number | null,
    divisionName: d.division.name,
    totalTags: d.totalTags,
  }));
  for (const a of project.tagAssignments) {
    const id = a.division?.id ?? null;
    if (!declared.some((d) => d.divisionId === id)) {
      declared.push({
        divisionId: id,
        divisionName: a.division?.name ?? "No division",
        totalTags: 0,
      });
    }
  }

  const divisionRates: DivisionRate[] = declared.map((d) => {
    const key = String(d.divisionId);
    const stat = divDelivered.get(key);
    const delivered = stat?.tags ?? 0;
    const activeDays = stat?.days.size ?? 0;
    const assignedHere = project.tagAssignments
      .filter((a) => (a.division?.id ?? null) === d.divisionId)
      .reduce((s, a) => s + a.assignedCount, 0);
    const scope = d.totalTags > 0 ? d.totalTags : assignedHere;
    return {
      divisionId: d.divisionId,
      divisionName: d.divisionName,
      totalTags: scope,
      delivered,
      remaining: Math.max(0, scope - delivered),
      activeDays,
      perDay: activeDays > 0 ? Math.round((delivered / activeDays) * 100) / 100 : 0,
    };
  });

  // --- who is engaged --------------------------------------------------
  const engaged = new Map<string, { id: string; name: string; delivered: number }>();
  for (const a of project.tagAssignments) {
    const e = engaged.get(a.assignee.id) ?? {
      id: a.assignee.id,
      name: a.assignee.name,
      delivered: 0,
    };
    e.delivered += a.deliveredCount;
    engaged.set(a.assignee.id, e);
  }

  return {
    days,
    divisionRates,
    peopleEngaged: Array.from(engaged.values()).sort(
      (a, b) => b.delivered - a.delivered,
    ),
  };
}
