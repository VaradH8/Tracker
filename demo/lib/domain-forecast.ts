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
  rateWasClamped,
  splitRate,
  toISODate,
  type ForecastResult,
} from "./forecast";
import {
  LIVE_ASSIGNMENT,
  TAG_HOLDER_ROLES,
  totalTagPosition,
} from "./domain";

/**
 * Tags/day for each person, derived from what Leads have actually approved
 * in the last RATE_HISTORY_DAYS. Attribution follows the assignment's
 * assignee (the person the tags belong to), not whoever typed the
 * submission. People with no approved history map to null — callers run
 * that through `effectiveRate`, which is zero when no rate is set.
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
    /** 5 or 6; null when the project never declared one, and the reader
     *  falls back to a five-day week. */
    workingDaysPerWeek: number | null;
    startDate: string;
    endDate: string;
    releasedAt: string | null;
    assignedTags: number;
    deliveredTags: number;
  }[];
  /** Tags assigned to them and not yet delivered, across every project. */
  openTags: number;
  /**
   * Projects they hold open tags on without a booking window.
   *
   * This is real commitment — assigning tags is what makes somebody busy
   * in practice — so the availability bar draws it too, and needs the
   * project's own dates to place it. Both dates are null on a project that
   * never declared them, in which case there is no honest span to draw and
   * the row says so rather than inventing one.
   */
  openTagProjects: {
    projectId: number;
    projectName: string;
    openTags: number;
    startDate: string | null;
    handoverDate: string | null;
    workingDaysPerWeek: number | null;
  }[];
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
    // workingDaysPerWeek comes along because the availability bar draws
    // real working days: a five-day project and a six-day one do not have
    // the same Saturdays, and a bar that ignores that overstates how much
    // of somebody's month is actually committed.
    include: {
      project: {
        select: { id: true, name: true, workingDaysPerWeek: true },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Tag totals per person per project, so a row can show what the booking
  // is actually carrying rather than just its dates.
  // Live work only. Somebody taken off a project keeps their rows for
  // the approval history's sake, but they are not carrying those tags any
  // more and must not read as busy because of them.
  const assignments = await prisma.domainTagAssignment.groupBy({
    by: ["assigneeId", "projectId"],
    where: LIVE_ASSIGNMENT,
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
  // allocation for, so the details come from a separate lookup. Dates come
  // along because the availability bar has to place that work on a
  // timeline, and an unbooked project has no allocation to take them from.
  const projectMeta = new Map(
    (
      await prisma.domainProject.findMany({
        select: {
          id: true,
          name: true,
          startDate: true,
          handoverDate: true,
          workingDaysPerWeek: true,
        },
      })
    ).map((p) => [p.id, p]),
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
      .map((a) => {
        const meta = projectMeta.get(a.projectId);
        return {
          projectId: a.projectId,
          projectName: meta?.name ?? "Unknown project",
          openTags: openOf(a),
          startDate: meta?.startDate ? toISODate(meta.startDate) : null,
          handoverDate: meta?.handoverDate ? toISODate(meta.handoverDate) : null,
          workingDaysPerWeek: meta?.workingDaysPerWeek ?? null,
        };
      });
    // The set rate, or nothing. Same rule as the forecast, because two
    // screens disagreeing about someone's speed is worse than either
    // being wrong alone.
    const rate = p.expectedTagsPerDay ?? null;
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
      // Only two answers now: somebody set it, or nobody did.
      rateSource: p.expectedTagsPerDay
        ? ("expected" as const)
        : ("default" as const),
      projects: mine.map((a) => {
        const tags = tagsBy.get(`${p.id}:${a.projectId}`);
        return {
          projectId: a.projectId,
          projectName: a.project.name,
          /** 5 or 6; null when the project never said, and the reader
           *  falls back to a five-day week. */
          workingDaysPerWeek: a.project.workingDaysPerWeek,
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
  /** The whole scope agreed with the client; null when not tracked. What
   *  the client still holds is derived from it — see lib/domain-scope. */
  contractTags: number | null;
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
    /** Whether their figure was set on this project's booking. Only these
     *  are exempted when `usePerProjectRates` is on. */
    rateIsPerProject: boolean;
    /** The stored rate was implausible and has been capped for planning.
     *  Shown, not hidden — it means there is a figure to go and fix. */
    rateClamped: boolean;
    usingDefaultRate: boolean;
  }[];
  /** The date the projection counts from — today, unless the project is
   *  staffed from a later date. */
  startsFrom: string;
  /** How many people actually hold tags on this project. */
  peopleEngaged: number;
  /** Bookings still open, whether or not the work is finished. */
  activeBookings: number;
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
export type ForecastOptions = {
  /**
   * Treat a rate set on a booking as final for that project.
   *
   * Off (the default), every rate is divided between the projects a
   * person is booked on at the same time. That is right for a whole-person
   * figure — a measured throughput, or a house default — because two
   * parallel projects cannot each have the whole of somebody's day.
   *
   * But a rate set on a booking is not a whole-person figure. It is a
   * Lead saying "on THIS project, expect 10/day", a statement that already
   * takes the sharing into account. Dividing it again applies the same
   * discount twice, and forces whoever set it to enter 20 to mean 10.
   *
   * Turning this on exempts exactly those rates. People with no rate set
   * on their booking keep sharing theirs, because theirs really is a
   * whole-person number.
   */
  usePerProjectRates?: boolean;
};

/**
 * Who counts as working on a project: everyone booked on it, AND everyone
 * holding tags on it.
 *
 * This used to be either/or — allocations when there were any, tag holders
 * otherwise. That made anybody carrying tags without a formal booking
 * vanish the moment one other person was booked: absent from the resource
 * list, and their rate left out of the project's throughput while their
 * tags still counted in what was left to do. The projection came out
 * pessimistic and the person came out invisible.
 *
 * Holding tags on a project is working on it. Both lists count, deduped
 * by id, bookings first so their record wins.
 */
export function peopleOnProject<T extends { id: string }>(
  allocations: { user: T }[],
  tagAssignments: { assignee: T }[],
): T[] {
  const byId = new Map<string, T>();
  for (const a of allocations) byId.set(a.user.id, a.user);
  for (const t of tagAssignments) byId.set(t.assignee.id, t.assignee);
  return Array.from(byId.values());
}

export async function projectForecasts(
  projectId?: number,
  opts: ForecastOptions = {},
): Promise<ProjectForecast[]> {
  const projects = await prisma.domainProject.findMany({
    where: projectId ? { id: projectId } : undefined,
    include: {
      owner: { select: { name: true } },
      divisions: { include: { division: { select: { id: true, name: true } } } },
      allocations: {
        include: { user: { select: { id: true, name: true } } },
      },
      /**
       * Every batch, removed ones included. What each contributes to the
       * totals is decided by `removedAt` (see assignmentContribution);
       * who is *on* the project is decided by filtering to the live ones,
       * a few lines down. Two different questions of the same rows.
       */
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

  /**
   * Every project a person holds tags on, booked there or not.
   *
   * peopleOnProject counts holding tags as working on a project, so the
   * divisor that shares a rate out has to count the same projects. It did
   * not: it looked only at bookings, so somebody holding tags on six
   * projects without a formal booking on any of them was returned as
   * "1 project" six times over, and their whole rate was added to all six.
   * The portfolio line sums those project rates, which is how one person
   * came to be counted six times in a single figure.
   */
  const allTagHolders = await prisma.domainTagAssignment.findMany({
    where: LIVE_ASSIGNMENT,
    select: { assigneeId: true, projectId: true },
  });
  const tagProjectsByUser = new Map<string, Set<number>>();
  for (const t of allTagHolders) {
    const set = tagProjectsByUser.get(t.assigneeId) ?? new Set<number>();
    set.add(t.projectId);
    tagProjectsByUser.set(t.assigneeId, set);
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
    // Batches still carried by somebody on the project. Capacity, the
    // people list and the per-division split of live work all come from
    // these; the totals below come from every batch.
    const liveAssignments = p.tagAssignments.filter((a) => !a.removedAt);
    const position = totalTagPosition(p.tagAssignments);
    const assignedTags = position.assigned;
    const deliveredTags = position.delivered;
    const pendingApprovalTags = liveAssignments.reduce(
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

    const people = peopleOnProject(p.allocations, liveAssignments);

    // The stretch this project's delivery actually spans. Used to decide
    // which of a person's other bookings genuinely compete with this one.
    const allocEnds = p.allocations.map((a) =>
      (a.releasedAt ?? a.endDate).getTime(),
    );
    const windowEnd =
      p.handoverDate ??
      (allocEnds.length > 0 ? new Date(Math.max(...allocEnds)) : from);

    /**
     * How many projects this person's day is split across.
     *
     * Counted as distinct projects, from both routes onto one: a booking
     * that overlaps this project's delivery window, or tags held. A
     * project reached both ways is still one project, which is why this
     * is a Set and not two lengths added together.
     *
     * Always at least 1, so a rate is never multiplied rather than shared.
     */
    const concurrentFor = (userId: string): number => {
      const projectIds = new Set<number>();
      for (const a of allocationsByUser.get(userId) ?? []) {
        if (rangesOverlap(from, windowEnd, a.startDate, a.releasedAt ?? a.endDate)) {
          projectIds.add(a.projectId);
        }
      }
      for (const id of tagProjectsByUser.get(userId) ?? []) projectIds.add(id);
      return Math.max(1, projectIds.size);
    };

    const resources = people.map((u) => {
      // Held separately from the fallback chain: whether the figure came
      // from this booking decides whether it may be shared again.
      /**
       * Only a rate somebody set. There is no third option.
       *
       *   1. set on this booking — "on THIS project, expect 100/day"
       *   2. set on the person   — what they were signed up at
       *
       * Measured throughput used to sit underneath as a fallback, and
       * before that it sat ABOVE the person's own figure, which meant a
       * single backdated batch could rewrite the plan: one person's
       * measurement came out at 21,257 tags a day because months of work
       * had been approved against one date.
       *
       * Removing it entirely rather than ranking it last is deliberate.
       * A figure that can only ever be reached when nobody has set a rate
       * is a house default wearing a different hat, and a plan built on a
       * number no human stands behind is worse than a plan that admits it
       * has none. Somebody with no rate set contributes nothing, and the
       * screens say so.
       */
      const bookingRate = perProjectRate.get(u.id) ?? null;
      const r = bookingRate ?? expected.get(u.id) ?? null;
      // effectiveRate clamps; this records that it had to, so the screens
      // can point at the figure that needs correcting instead of quietly
      // planning with a different number from the one stored.
      const rateClamped = rateWasClamped(r);
      const fullRate = effectiveRate(r);
      const concurrentProjects = concurrentFor(u.id);
      const rateIsPerProject = bookingRate !== null;
      const shareAcross =
        opts.usePerProjectRates && rateIsPerProject ? 1 : concurrentProjects;
      return {
        id: u.id,
        name: u.name,
        rate: splitRate(fullRate, shareAcross),
        fullRate,
        concurrentProjects,
        /** True when this person's figure was set on the booking itself. */
        rateIsPerProject,
        /** True when the stored figure was above MAX_TAGS_PER_DAY and is
         *  being planned with at the ceiling instead. */
        rateClamped,
        usingDefaultRate: r === null,
      };
    });

    const divisions = p.divisions.map((pd) => {
      const forDivision = p.tagAssignments.filter(
        (a) => a.divisionId === pd.divisionId,
      );
      const divPosition = totalTagPosition(forDivision);
      return {
        id: pd.division.id,
        name: pd.division.name,
        totalTags: pd.totalTags,
        assignedTags: divPosition.assigned,
        deliveredTags: divPosition.delivered,
      };
    });

    return {
      id: p.id,
      name: p.name,
      owner: p.owner.name,
      startDate: p.startDate ? toISODate(p.startDate) : null,
      handoverDate: p.handoverDate ? toISODate(p.handoverDate) : null,
      totalTags,
      contractTags: p.contractTags,
      assignedTags,
      deliveredTags,
      remainingTags,
      pendingApprovalTags,
      divisions,
      resources,
      /** When the projection starts counting from — today, unless the
       *  project is staffed from a later date. */
      startsFrom: toISODate(from),
      peopleEngaged: new Set(liveAssignments.map((a) => a.assigneeId)).size,
      /**
       * Work that has not begun is reported as such rather than as
       * behind. `from` is today unless the project is staffed from a
       * later date, so `from > now` is exactly "nobody was due to start
       * yet" — and a project nobody was due to start cannot be behind on
       * delivery.
       *
       * Only the label changes. slackDays and projectedDate are left
       * alone, so a project that already cannot make its handover still
       * reports negative slack and still shows its projected date in the
       * late colour.
       */
      /** Bookings still open on this project — what "free up the
       *  resources" would release once it is finished. */
      activeBookings: p.allocations.length,
      forecast: (() => {
        const f = forecastDelivery({
          remainingTags,
          rates: resources.map((r) => r.rate),
          from,
          handoverDate: p.handoverDate,
        });
        /**
         * Finished. Everything the project holds has been delivered.
         *
         * Decided here rather than inside forecastDelivery because that
         * only sees what is left, and "nothing left" is also true of a
         * project with no tags set up at all — which is not finished, it
         * is not started. Both totals are needed to tell them apart.
         */
        if (totalTags > 0 && deliveredTags >= totalTags) {
          return { ...f, status: "Completed" as const, slackDays: null };
        }
        return from.getTime() > now.getTime()
          ? { ...f, status: "Yet to be started" as const }
          : f;
      })(),
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
