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
  toISODate,
  type ForecastResult,
} from "./forecast";
import { WORKING_ROLES } from "./domain";

/**
 * Tags/day for each person, derived from what Leads have actually approved
 * in the last RATE_HISTORY_DAYS. Attribution follows the assignment's
 * assignee (the person the tags belong to), not whoever typed the
 * submission. People with no approved history map to null — callers run
 * that through `effectiveRate` to get the house default.
 */
export async function ratesByUser(): Promise<Map<string, number | null>> {
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

  // tags delivered, and the distinct days they were delivered on
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

  const rates = new Map<string, number | null>();
  for (const [userId, { tags, days }] of tally) {
    rates.set(userId, personalRate(tags, days.size));
  }
  return rates;
}

export type ResourceForecast = {
  id: string;
  name: string;
  role: string;
  /** Tags/day from approved history, or null when they have none yet. */
  rate: number | null;
  /** The rate actually used in projections (falls back to the default). */
  effectiveRate: number;
  usingDefaultRate: boolean;
  projects: {
    projectId: number;
    projectName: string;
    startDate: string;
    endDate: string;
    releasedAt: string | null;
    assignedTags: number;
    deliveredTags: number;
  }[];
  /** ISO date they next free up; null means free right now. */
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
      where: { isActive: true, role: { in: WORKING_ROLES } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    ratesByUser(),
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

  return people.map((p) => {
    const mine = allocations.filter((a) => a.userId === p.id);
    const rate = rates.get(p.id) ?? null;
    const free = availableFrom(
      mine.map((a) => ({ endDate: a.endDate, releasedAt: a.releasedAt })),
    );
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      rate,
      effectiveRate: effectiveRate(rate),
      usingDefaultRate: rate === null,
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
      availableFrom: free ? toISODate(free) : null,
      status: mine.length === 0 ? "Free" : "Allocated",
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
  resources: { id: string; name: string; rate: number; usingDefaultRate: boolean }[];
  /** The date the projection counts from — today, unless the project is
   *  staffed from a later date. */
  startsFrom: string;
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
  const now = new Date();

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

    // Who's on the job: the formal allocations, else whoever holds tags.
    const allocated = p.allocations.map((a) => a.user);
    const fromAssignments = Array.from(
      new Map(p.tagAssignments.map((a) => [a.assignee.id, a.assignee])).values(),
    );
    const people = allocated.length > 0 ? allocated : fromAssignments;

    const resources = people.map((u) => {
      const r = rates.get(u.id) ?? null;
      return {
        id: u.id,
        name: u.name,
        rate: effectiveRate(r),
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
