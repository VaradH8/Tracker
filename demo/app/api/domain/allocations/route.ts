import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { TAG_HOLDER_ROLES, SUPERVISOR_ROLES, type DomainRole } from "@/lib/domain";
import { allocationConflicts } from "@/lib/domain-forecast";
import { toISODate } from "@/lib/forecast";

/**
 * Booking a resource onto a project for a window of time. This is what the
 * forecast reads to answer "who's free, and from when", and what raises the
 * conflict prompt when someone is booked over an existing commitment.
 */

function serialize(a: {
  id: number;
  projectId: number;
  project: { name: string; client: string | null; handoverDate: Date | null };
  userId: string;
  user: { name: string; role: string };
  startDate: Date;
  endDate: Date;
  releasedAt: Date | null;
  expectedTagsPerDay: number | null;
}) {
  return {
    id: a.id,
    projectId: a.projectId,
    projectName: a.project.name,
    client: a.project.client,
    handoverDate: a.project.handoverDate ? toISODate(a.project.handoverDate) : null,
    userId: a.userId,
    userName: a.user.name,
    userRole: a.user.role,
    startDate: toISODate(a.startDate),
    endDate: toISODate(a.endDate),
    releasedAt: a.releasedAt ? toISODate(a.releasedAt) : null,
    expectedTagsPerDay: a.expectedTagsPerDay,
  };
}

const INCLUDE = {
  project: { select: { name: true, client: true, handoverDate: true } },
  user: { select: { name: true, role: true } },
} as const;

/**
 * Leads and Admins plan with this view.
 *
 * `?mine=true` is the one form open to everyone: a member needs to see the
 * projects they've been booked onto, which is otherwise invisible to them
 * until a Lead also assigns them tags. It is hard-scoped to the caller —
 * the `userId` parameter is ignored rather than merged, so this can only
 * ever narrow to self and never be used to read someone else's bookings.
 */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const userId = url.searchParams.get("userId");
  const mine = url.searchParams.get("mine") === "true";

  // Reading the plan is a supervisor privilege; changing it (POST below,
  // and PATCH/DELETE in ./[id]) stays with Admins and Leads.
  if (!mine) {
    const forbidden = requireDomainRole(user, SUPERVISOR_ROLES);
    if (forbidden) return forbidden;
  }

  const allocations = await prisma.domainAllocation.findMany({
    where: {
      ...(projectId ? { projectId: Number(projectId) } : {}),
      ...(mine ? { userId: user.id } : userId ? { userId } : {}),
    },
    include: INCLUDE,
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json({ allocations: allocations.map(serialize) });
}

/**
 * Allocate someone to a project.
 *
 * When the window clashes with an existing booking the request is refused
 * with 409 and the clashing details, so the UI can show "Mukesh is on
 * Project X until the 20th, free from the 21st". Re-send with
 * `acknowledgeConflicts: true` to book anyway — double-booking is
 * sometimes the real intent, but it should be a deliberate act.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const forbidden = requireDomainRole(user, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const projectId = Number(body.projectId);
  const userId = String(body.userId ?? "");
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Pick a project." }, { status: 400 });
  }
  if (!userId) {
    return NextResponse.json({ error: "Pick a resource." }, { status: 400 });
  }

  const [project, resource] = await Promise.all([
    prisma.domainProject.findUnique({ where: { id: projectId } }),
    prisma.domainUser.findUnique({ where: { id: userId } }),
  ]);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  if (!resource || !resource.isActive) {
    return NextResponse.json({ error: "Resource not found." }, { status: 400 });
  }
  // Anyone who can hold tags must be bookable, or their work has no
  // window for the forecast to plan across.
  if (!TAG_HOLDER_ROLES.includes(resource.role as DomainRole)) {
    return NextResponse.json(
      { error: "Admins can't be booked onto a project — they don't carry delivery." },
      { status: 400 },
    );
  }

  const startDate = body.startDate
    ? new Date(String(body.startDate))
    : (project.startDate ?? new Date());
  const endDate = body.endDate
    ? new Date(String(body.endDate))
    : project.handoverDate;
  if (!endDate || Number.isNaN(endDate.getTime()) || Number.isNaN(startDate.getTime())) {
    return NextResponse.json(
      { error: "Give the allocation an end date (or set the project's handover date)." },
      { status: 400 },
    );
  }
  if (endDate < startDate) {
    return NextResponse.json(
      { error: "The end date can't fall before the start date." },
      { status: 400 },
    );
  }

  const conflicts = await allocationConflicts(userId, startDate, endDate, projectId);
  if (conflicts.length > 0 && body.acknowledgeConflicts !== true) {
    return NextResponse.json(
      {
        error: `${resource.name} is already allocated over these dates.`,
        conflicts,
      },
      { status: 409 },
    );
  }

  // What this person is expected to manage on this project specifically.
  const rateRaw = Number(body.expectedTagsPerDay);
  const expectedTagsPerDay =
    Number.isFinite(rateRaw) && rateRaw > 0
      ? Math.round(rateRaw * 100) / 100
      : null;

  // One booking per person per project — re-allocating adjusts the window
  // rather than stacking duplicates.
  const allocation = await prisma.domainAllocation.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: {
      projectId,
      userId,
      startDate,
      endDate,
      expectedTagsPerDay,
      createdById: user.id,
    },
    update: {
      startDate,
      endDate,
      releasedAt: null,
      ...(expectedTagsPerDay !== null ? { expectedTagsPerDay } : {}),
    },
    include: INCLUDE,
  });

  return NextResponse.json(
    { allocation: serialize(allocation), conflicts },
    { status: 201 },
  );
}
