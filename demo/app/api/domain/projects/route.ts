import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { WORKING_ROLES, divisionTagsIssue, type DomainRole } from "@/lib/domain";
import { allocationConflicts, projectForecasts } from "@/lib/domain-forecast";
import { toISODate } from "@/lib/forecast";

const INCLUDE = {
  owner: { select: { id: true, name: true } },
  _count: { select: { tasks: true } },
  divisions: { include: { division: { select: { id: true, name: true } } } },
  allocations: { include: { user: { select: { id: true, name: true } } } },
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
    user: { id: string; name: string };
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
    totalTags: p.totalTags,
    client: p.client,
    divisions: p.divisions.map((d) => ({
      id: d.division.id,
      name: d.division.name,
      totalTags: d.totalTags,
    })),
    resources: p.allocations.map((a) => ({
      allocationId: a.id,
      id: a.user.id,
      name: a.user.name,
      startDate: toISODate(a.startDate),
      endDate: toISODate(a.endDate),
      releasedAt: a.releasedAt ? toISODate(a.releasedAt) : null,
    })),
  };
}

/** Everyone signed into the domain can see the project list — they need
 *  it to work tasks. */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const projects = await prisma.domainProject.findMany({
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

  const startDate = body.startDate ? new Date(String(body.startDate)) : null;
  const handoverDate = body.handoverDate ? new Date(String(body.handoverDate)) : null;
  if (startDate && Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
  }
  if (handoverDate && Number.isNaN(handoverDate.getTime())) {
    return NextResponse.json({ error: "Invalid handover date." }, { status: 400 });
  }
  if (startDate && handoverDate && handoverDate < startDate) {
    return NextResponse.json(
      { error: "Handover can't fall before the project starts." },
      { status: 400 },
    );
  }

  const totalTagsRaw = Number(body.totalTags ?? 0);
  const totalTags =
    Number.isInteger(totalTagsRaw) && totalTagsRaw > 0 ? totalTagsRaw : 0;

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
      if (!WORKING_ROLES.includes(p.role as DomainRole)) {
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
      totalTags,
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
