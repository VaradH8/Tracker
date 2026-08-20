import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import {
  assignableRoles,
  assignmentCapIssue,
  normaliseComplexity,
  type DomainRole,
} from "@/lib/domain";
import { toISODate } from "@/lib/forecast";

/**
 * Edit or remove a tag assignment: move it to a different person or
 * division, change its dates, or adjust the count.
 *
 * `deliveredCount` is special. It normally moves one way only — an
 * actionee submits, a Lead approves, the total goes up — and that is what
 * makes it worth anything. An Admin, and only an Admin, may set it
 * directly, because a figure that cannot be corrected is not trustworthy
 * either: tags delivered before the system existed, a batch approved
 * twice, an import that landed short. None of those can be fixed by
 * approving something.
 *
 * Every such edit costs a stated reason and writes a
 * DomainDeliveryCorrection row, so the number stays as auditable as it was.
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

  if (body.complexity !== undefined) {
    data.complexity = normaliseComplexity(body.complexity);
  }

  // Moving the work to someone else.
  if (body.assigneeId !== undefined) {
    const assignee = await prisma.domainUser.findUnique({
      where: { id: String(body.assigneeId) },
    });
    if (!assignee || !assignee.isActive) {
      return NextResponse.json({ error: "Assignee not found." }, { status: 400 });
    }
    // Same hierarchy as the original assignment — moving work must not be
    // a way around who you're allowed to hand it to.
    const allowed = assignableRoles(userOrResp.role);
    if (!allowed.includes(assignee.role as DomainRole)) {
      return NextResponse.json(
        {
          error: `You can assign tags to ${allowed.join(", ")} — not to a ${assignee.role}.`,
        },
        { status: 403 },
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

  /**
   * The manual correction.
   *
   * Admin only — not Lead, not Team Lead. A Lead approving their own
   * team's submissions and also being able to type the total afterwards
   * is a delivery figure with no second pair of eyes anywhere in it.
   */
  let correction: { before: number; after: number; reason: string } | null = null;
  if (body.deliveredCount !== undefined) {
    if (userOrResp.role !== "Admin") {
      return NextResponse.json(
        {
          error:
            "Only an admin can set a delivered count by hand. Everyone else moves it by approving a submission.",
        },
        { status: 403 },
      );
    }
    const deliveredCount = Number(body.deliveredCount);
    if (!Number.isInteger(deliveredCount) || deliveredCount < 0) {
      return NextResponse.json(
        { error: "Delivered must be a whole number of 0 or more." },
        { status: 400 },
      );
    }
    // The ceiling is what this batch carries. Letting delivered exceed
    // assigned would put progress bars over 100% and make "remaining"
    // negative everywhere it is computed; raising the assigned count
    // first is the honest fix, and it is editable in the same form.
    const ceiling = (data.assignedCount as number) ?? existing.assignedCount;
    if (deliveredCount > ceiling) {
      return NextResponse.json(
        {
          error: `This batch only carries ${ceiling} tags. Raise the assigned count first, then set delivered.`,
        },
        { status: 400 },
      );
    }
    const reason =
      typeof body.correctionReason === "string"
        ? body.correctionReason.trim().slice(0, 500)
        : "";
    if (!reason) {
      return NextResponse.json(
        { error: "Say why you're correcting this — it goes on the record." },
        { status: 400 },
      );
    }
    // A no-op edit records nothing. Otherwise re-saving a form would fill
    // the history with rows that say a number stayed the same.
    if (deliveredCount !== existing.deliveredCount) {
      data.deliveredCount = deliveredCount;
      correction = {
        before: existing.deliveredCount,
        after: deliveredCount,
        reason,
      };
    }
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

  // One transaction: a delivered figure that moved without its
  // explanation is exactly the thing this feature is supposed to prevent.
  const [updated] = await prisma.$transaction([
    prisma.domainTagAssignment.update({ where: { id }, data, include: INCLUDE }),
    ...(correction
      ? [
          prisma.domainDeliveryCorrection.create({
            data: {
              assignmentId: id,
              before: correction.before,
              after: correction.after,
              reason: correction.reason,
              actorId: userOrResp.id,
            },
          }),
        ]
      : []),
  ]);

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
      complexity: updated.complexity,
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
