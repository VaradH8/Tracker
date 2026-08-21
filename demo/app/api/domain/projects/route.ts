import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import {
  LIVE_ASSIGNMENT,
  TAG_HOLDER_ROLES,
  divisionTagsIssue,
  totalTagPosition,
  type DomainRole,
} from "@/lib/domain";
import { allocationConflicts, projectForecasts } from "@/lib/domain-forecast";
import { toISODate } from "@/lib/forecast";
import { resolveSchedule } from "@/lib/domain-schedule";

const INCLUDE = {
  owner: { select: { id: true, name: true } },
  _count: { select: { tasks: true } },
  divisions: { include: { division: { select: { id: true, name: true } } } },
  allocations: {
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { startDate: "asc" },
  },
  // Enough of the tag position to draw a progress bar on the index without
  // a second round trip per project.
  /**
   * Every batch, removed ones included — `removedAt` decides what each
   * contributes. Filtering them out here wiped a removed person's
   * delivered tags off the project, which is not what removing somebody
   * means; see assignmentContribution.
   */
  tagAssignments: {
    select: {
      assigneeId: true,
      divisionId: true,
      assignedCount: true,
      deliveredCount: true,
      removedAt: true,
    },
  },
} as const;

type ProjectRow = {
  id: number;
  name: string;
  description: string | null;
  owner: { id: string; name: string };
  _count: { tasks: number };
  createdAt: Date;
  startDate: Date | null;
  handoverDate: Date | null;
  contractTags: number | null;
  workingDaysPerWeek: number | null;
  totalWorkingDays: number | null;
  totalTags: number;
  client: string | null;
  divisions: {
    divisionId: number;
    totalTags: number;
    division: { id: number; name: string };
  }[];
  allocations: {
    id: number;
    startDate: Date;
    endDate: Date;
    releasedAt: Date | null;
    expectedTagsPerDay: number | null;
    user: { id: string; name: string; role: string };
  }[];
  tagAssignments: {
    assigneeId: string;
    divisionId: number | null;
    assignedCount: number;
    deliveredCount: number;
    removedAt: Date | null;
  }[];
};

function serialize(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    owner: p.owner.name,
    ownerId: p.owner.id,
    taskCount: p._count.tasks,
    createdAt: p.createdAt.toISOString(),
    startDate: p.startDate ? toISODate(p.startDate) : null,
    handoverDate: p.handoverDate ? toISODate(p.handoverDate) : null,
    contractTags: p.contractTags,
    workingDaysPerWeek: p.workingDaysPerWeek,
    totalWorkingDays: p.totalWorkingDays,
    totalTags: p.totalTags,
    client: p.client,
    /**
     * Per-division delivery, counted the same way as the project total
     * right below it — removed batches included, contributing what they
     * delivered.
     *
     * This used to send only `totalTags`, so the project page had to sum
     * the live assignment rows it happened to be holding. Take somebody
     * off a project and their batches leave those rows, and every
     * division dropped to "0 delivered" while the project above it still
     * said 4,857. The work had not moved; the only list that could see it
     * had.
     */
    divisions: p.divisions.map((d) => {
      const forDivision = p.tagAssignments.filter(
        (a) => a.divisionId === d.division.id,
      );
      const position = totalTagPosition(forDivision);
      return {
        id: d.division.id,
        name: d.division.name,
        totalTags: d.totalTags,
        assignedTags: position.assigned,
        deliveredTags: position.delivered,
      };
    }),
    resources: p.allocations.map((a) => ({
      allocationId: a.id,
      id: a.user.id,
      name: a.user.name,
      startDate: toISODate(a.startDate),
      endDate: toISODate(a.endDate),
      releasedAt: a.releasedAt ? toISODate(a.releasedAt) : null,
      expectedTagsPerDay: a.expectedTagsPerDay,
      role: a.user.role,
    })),
    assignedTags: totalTagPosition(p.tagAssignments).assigned,
    deliveredTags: totalTagPosition(p.tagAssignments).delivered,
    // People, unlike tags, do leave. Somebody removed is not engaged on
    // this project any more, however much of it they delivered.
    peopleEngaged: new Set(
      p.tagAssignments.filter((a) => !a.removedAt).map((a) => a.assigneeId),
    ).size,
  };
}

/**
 * The project list.
 *
 * Supervisors see the whole portfolio — planning is their job. SMEs and
 * Actionees see only the projects they are actually on, by any of the
 * three ways someone gets put on one:
 *
 *   - they hold tags on it
 *   - they are booked on it
 *   - they have a task on it
 *
 * All three count because they are independent in practice: tags get
 * assigned without a booking, and a task can land on a project someone
 * was never formally allocated to. Scoping on bookings alone would hide
 * projects people are demonstrably working on.
 *
 * This is a narrowing of what the screen shows, not a security boundary
 * for the project's contents — an unlisted project is not secret, it is
 * simply not theirs to wade through.
 */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const ownOnly = user.role === "SME" || user.role === "Actionee";
  const projects = await prisma.domainProject.findMany({
    where: ownOnly
      ? {
          OR: [
            { tagAssignments: { some: { assigneeId: user.id, ...LIVE_ASSIGNMENT } } },
            { allocations: { some: { userId: user.id } } },
            { tasks: { some: { assigneeId: user.id } } },
          ],
        }
      : undefined,
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ projects: projects.map(serialize) });
}

/**
 * Lead (project owner) or Admin creates projects.
 *
 * Creation optionally carries the whole forecast setup in one go: the
 * divisions the work splits into, the resources to book, the tag count and
 * the handover date. The response includes the resulting forecast, so the
 * form can show On Track / Behind Schedule the moment the project exists.
 *
 * Resource clashes do NOT block creation — the project is real either way.
 * They come back in `conflicts` for the UI to surface.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const forbidden = requireDomainRole(user, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  // Dates, and — when a working-day count is supplied — the handover date
  // derived from it. Computed here rather than trusted from the form: it
  // is the date the client is given.
  const schedule = await resolveSchedule(body);
  if (!schedule.ok) {
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  }
  const { startDate, handoverDate, workingDaysPerWeek, totalWorkingDays } =
    schedule.value;

  const totalTagsRaw = Number(body.totalTags ?? 0);
  const totalTags =
    Number.isInteger(totalTagsRaw) && totalTagsRaw > 0 ? totalTagsRaw : 0;

  // The whole scope agreed with the client. Optional: a project that
  // doesn't track it stores null, which reads as "not tracked" rather
  // than as a contract of nothing.
  const contractRaw = body.contractTags;
  let contractTags: number | null = null;
  if (contractRaw !== undefined && contractRaw !== null && contractRaw !== "") {
    const n = Number(contractRaw);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { error: "Contract scope must be a whole number of 0 or more." },
        { status: 400 },
      );
    }
    contractTags = n;
  }

  // Divisions: [{ divisionId?, name?, totalTags? }] — an id picks from the
  // catalogue, a name creates or reuses an entry by case-insensitive match.
  const divisionInput: { divisionId?: unknown; name?: unknown; totalTags?: unknown }[] =
    Array.isArray(body.divisions) ? body.divisions : [];

  const catalogue = await prisma.domainDivision.findMany({
    select: { id: true, name: true },
  });
  const byLowerName = new Map(catalogue.map((d) => [d.name.toLowerCase(), d]));
  const validIds = new Set(catalogue.map((d) => d.id));

  const resolvedDivisions: { divisionId: number; totalTags: number }[] = [];
  for (const raw of divisionInput) {
    const tags = Number(raw.totalTags ?? 0);
    const divisionTags = Number.isInteger(tags) && tags > 0 ? tags : 0;

    if (raw.divisionId !== undefined && raw.divisionId !== null && raw.divisionId !== "") {
      const id = Number(raw.divisionId);
      if (!validIds.has(id)) {
        return NextResponse.json({ error: "Unknown division." }, { status: 400 });
      }
      resolvedDivisions.push({ divisionId: id, totalTags: divisionTags });
      continue;
    }

    const divisionName = String(raw.name ?? "").trim();
    if (!divisionName) continue;
    const existing = byLowerName.get(divisionName.toLowerCase());
    if (existing) {
      resolvedDivisions.push({ divisionId: existing.id, totalTags: divisionTags });
    } else {
      const created = await prisma.domainDivision.create({
        data: { name: divisionName },
        select: { id: true, name: true },
      });
      byLowerName.set(created.name.toLowerCase(), created);
      validIds.add(created.id);
      resolvedDivisions.push({ divisionId: created.id, totalTags: divisionTags });
    }
  }
  // Same division listed twice would break the project/division unique key.
  const dedupedDivisions = Array.from(
    new Map(resolvedDivisions.map((d) => [d.divisionId, d])).values(),
  );

  // The divisions can't promise more tags than the project has.
  const budgetIssue = divisionTagsIssue(
    totalTags,
    dedupedDivisions.map((d) => d.totalTags),
  );
  if (budgetIssue) {
    return NextResponse.json({ error: budgetIssue }, { status: 400 });
  }

  // Resources to allocate. Bookings run for the project window; without a
  // handover date there's no window, so they're skipped with a note.
  const resourceIds: string[] = Array.isArray(body.resourceIds)
    ? Array.from(new Set(body.resourceIds.map((id: unknown) => String(id))))
    : [];

  let allocatable: { id: string; name: string }[] = [];
  if (resourceIds.length > 0) {
    const people = await prisma.domainUser.findMany({
      where: { id: { in: resourceIds }, isActive: true },
      select: { id: true, name: true, role: true },
    });
    for (const p of people) {
      if (!TAG_HOLDER_ROLES.includes(p.role as DomainRole)) {
        return NextResponse.json(
          { error: `${p.name} can't be allocated — only Actionees, SMEs, and Team Leads can.` },
          { status: 400 },
        );
      }
    }
    allocatable = people.map((p) => ({ id: p.id, name: p.name }));
  }

  const allocStart = startDate ?? new Date();
  const allocEnd = handoverDate;

  // Check clashes before writing so the response can name them, but let the
  // creation go through regardless — the Lead may well intend it.
  const conflicts =
    allocEnd && allocatable.length > 0
      ? (
          await Promise.all(
            allocatable.map(async (p) => ({
              resourceId: p.id,
              resourceName: p.name,
              conflicts: await allocationConflicts(p.id, allocStart, allocEnd),
            })),
          )
        ).filter((c) => c.conflicts.length > 0)
      : [];

  const created = await prisma.domainProject.create({
    data: {
      name,
      description,
      ownerId: user.id,
      startDate,
      handoverDate,
      workingDaysPerWeek,
      totalWorkingDays,
      totalTags,
      contractTags,
      client:
        typeof body.client === "string" && body.client.trim()
          ? body.client.trim()
          : null,
      divisions: dedupedDivisions.length
        ? { create: dedupedDivisions }
        : undefined,
      allocations:
        allocEnd && allocatable.length
          ? {
              create: allocatable.map((p) => ({
                userId: p.id,
                startDate: allocStart,
                endDate: allocEnd,
                createdById: user.id,
              })),
            }
          : undefined,
    },
    include: INCLUDE,
  });

  const [forecast] = await projectForecasts(created.id);

  return NextResponse.json(
    {
      project: serialize(created),
      forecast: forecast?.forecast ?? null,
      conflicts,
      // Allocation needs an end date to bound the booking.
      allocationsSkipped:
        !allocEnd && resourceIds.length > 0
          ? "Resources weren't allocated because the project has no handover date."
          : null,
    },
    { status: 201 },
  );
}
