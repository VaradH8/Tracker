import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { WORKING_ROLES, assignmentCapIssue, type DomainRole } from "@/lib/domain";
import { toISODate } from "@/lib/forecast";

/**
 * Edit or remove a tag assignment: move it to a different person or
 * division, change its dates, or adjust the count.
 *
 * The one thing that can't be edited here is `deliveredCount` — that moves
 * only through Lead approval, so an edit can never quietly manufacture
 * delivered work.
 */

const INCLUDE = {
  project: { select: { id: true, name: true, totalTags: true, handoverDate: true } },
  division: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead", "TeamLead"]);
  if (forbidden) return forbidden;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.domainTagAssignment.findUnique({
    where: { id },
    include: { project: { include: { divisions: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  // Moving the work to someone else.
  if (body.assigneeId !== undefined) {
    const assignee = await prisma.domainUser.findUnique({
      where: { id: String(body.assigneeId) },
    });
    if (!assignee || !assignee.isActive) {
      return NextResponse.json({ error: "Assignee not found." }, { status: 400 });
    }
    if (!WORKING_ROLES.includes(assignee.role as DomainRole)) {
      return NextResponse.json(
        { error: "Tags can only be assigned to Actionees, SMEs, or Team Leads." },
        { status: 400 },
      );
    }
    data.assigneeId = assignee.id;
  }

  // Moving it to a different division of the same project.
  if (body.divisionId !== undefined) {
    if (body.divisionId === null || body.divisionId === "") {
      if (existing.project.divisions.length > 0) {
        return NextResponse.json(
          { error: "This project is split by division — pick one." },
          { status: 400 },
        );
      }
      data.divisionId = null;
    } else {
      const divisionId = Number(body.divisionId);
      if (!existing.project.divisions.some((d) => d.divisionId === divisionId)) {
        return NextResponse.json(
          { error: "That division isn't set up on this project." },
          { status: 400 },
        );
      }
      data.divisionId = divisionId;
    }
  }

  for (const field of ["startDate", "targetDate"] as const) {
    if (body[field] === undefined) continue;
    if (body[field] === null || body[field] === "") {
      data[field] = null;
      continue;
    }
    const d = new Date(String(body[field]));
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: `Invalid ${field}.` }, { status: 400 });
    }
    data[field] = d;
  }

  const start = (data.startDate as Date | null) ?? existing.startDate;
  const target = (data.targetDate as Date | null) ?? existing.targetDate;
  if (start && target && target < start) {
    return NextResponse.json(
      { error: "The target date can't fall before the start date." },
      { status: 400 },
    );
  }

  // Changing how many tags this batch carries.
  if (body.assignedCount !== undefined) {
    const assignedCount = Number(body.assignedCount);
    if (!Number.isInteger(assignedCount) || assignedCount < 1) {
      return NextResponse.json(
        { error: "Tag count must be a whole number of 1 or more." },
        { status: 400 },
      );
    }
    // Can't shrink a batch below what's already been signed off.
    if (assignedCount < existing.deliveredCount) {
      return NextResponse.json(
        {
          error: `${existing.deliveredCount} tags are already delivered here — the count can't go below that.`,
        },
        { status: 400 },
      );
    }
    data.assignedCount = assignedCount;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Re-check the ceiling against wherever the assignment now sits, ignoring
  // this row's own current contribution so an edit isn't blocked by itself.
  const targetDivisionId =
    data.divisionId !== undefined ? (data.divisionId as number | null) : existing.divisionId;
  const nextCount = (data.assignedCount as number) ?? existing.assignedCount;

  const siblings = await prisma.domainTagAssignment.findMany({
    where: {
      projectId: existing.projectId,
      divisionId: targetDivisionId,
      id: { not: existing.id },
    },
    select: { assignedCount: true },
  });
  const alreadyAssigned = siblings.reduce((s, a) => s + a.assignedCount, 0);

  const cap =
    targetDivisionId === null
      ? existing.project.totalTags
      : (existing.project.divisions.find((d) => d.divisionId === targetDivisionId)
          ?.totalTags ?? 0);
  const label =
    targetDivisionId === null
      ? "project"
      : "division";
  const capIssue = assignmentCapIssue(cap, alreadyAssigned, nextCount, label);
  if (capIssue) return NextResponse.json({ error: capIssue }, { status: 400 });

  const updated = await prisma.domainTagAssignment.update({
    where: { id },
    data,
    include: INCLUDE,
  });

  return NextResponse.json({
    assignment: {
      id: updated.id,
      projectId: updated.project.id,
      projectName: updated.project.name,
      divisionId: updated.division?.id ?? null,
      divisionName: updated.division?.name ?? null,
      assigneeId: updated.assignee.id,
      assigneeName: updated.assignee.name,
      assignedCount: updated.assignedCount,
      deliveredCount: updated.deliveredCount,
      remainingCount: Math.max(0, updated.assignedCount - updated.deliveredCount),
      startDate: updated.startDate ? toISODate(updated.startDate) : null,
      targetDate: updated.targetDate ? toISODate(updated.targetDate) : null,
    },
  });
}

/** Remove an assignment. Refused once work has been signed off against it,
 *  since deleting would erase delivered tags from the project's totals. */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead", "TeamLead"]);
  if (forbidden) return forbidden;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.domainTagAssignment.findUnique({
    where: { id },
    select: { deliveredCount: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.deliveredCount > 0) {
    return NextResponse.json(
      {
        error: `${existing.deliveredCount} tags have already been delivered here. Reduce the count instead of deleting it.`,
      },
      { status: 400 },
    );
  }

  await prisma.domainTagAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
