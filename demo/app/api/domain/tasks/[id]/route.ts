import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import {
  DOMAIN_TASK_STATUSES,
  backdateFloorISO,
  backdateWindowLabel,
  istParts,
  type DomainRole,
  type DomainTaskStatus,
} from "@/lib/domain";
import { TASK_INCLUDE as INCLUDE, serializeTask as serialize } from "@/lib/domain-task";


const MANAGER_ROLES: DomainRole[] = ["Admin", "Lead", "TeamLead"];

/** Delete a task. Managers only (Admin/Lead/TeamLead). Any work logs that
 *  referenced it keep their hours — the task link just goes null. */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!MANAGER_ROLES.includes(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await prisma.domainTask.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

/** Update a task. The assignee can move its status; Admin/Lead/TeamLead
 *  can also reassign, retitle, or set the target date. */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const task = await prisma.domainTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isManager =
    user.role === "Admin" || user.role === "Lead" || user.role === "TeamLead";
  const isAssignee = task.assigneeId === user.id;
  if (!isManager && !isAssignee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : null;

  /**
   * The lifecycle transitions, kept separate from field edits.
   *
   * submit  — the assignee, and only the assignee, says it's done, with a
   *           note and the day they did it.
   * approve
   * reject  — whoever assigned it decides. Not "any manager": a task
   *           handed out by a Team Lead is theirs to sign off, and letting
   *           an unrelated Lead close it would lose the thread.
   */
  if (action === "submit") {
    if (!isAssignee) {
      return NextResponse.json(
        { error: "Only the person the task is assigned to can submit it." },
        { status: 403 },
      );
    }
    if (task.status === "Submitted") {
      return NextResponse.json(
        { error: "This task is already waiting for review." },
        { status: 409 },
      );
    }
    if (task.status === "Approved") {
      return NextResponse.json(
        { error: "This task has already been approved." },
        { status: 409 },
      );
    }
    const note = String(body.note ?? "").trim();
    if (!note) {
      return NextResponse.json(
        { error: "Add a note on what you did." },
        { status: 400 },
      );
    }
    const raw = String(body.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return NextResponse.json({ error: "Pick the date you did the work." }, { status: 400 });
    }
    const todayISO = istParts().dateISO;
    if (raw > todayISO) {
      return NextResponse.json(
        { error: "You can't submit a task for a future date." },
        { status: 400 },
      );
    }
    const floor = backdateFloorISO();
    if (raw < floor) {
      return NextResponse.json(
        { error: `Dates go ${backdateWindowLabel()} — nothing earlier than ${floor}.` },
        { status: 400 },
      );
    }
    /**
     * Work you gave yourself has nobody to approve it, so submitting
     * records it as done rather than parking it in a queue that would
     * never be looked at. reviewedById stays null — nobody reviewed it,
     * and naming the author as their own approver would be a lie.
     */
    const selfCreated = task.createdById === user.id;

    const submitted = await prisma.domainTask.update({
      where: { id },
      data: {
        status: selfCreated ? "Approved" : "Submitted",
        submittedOn: new Date(raw + "T00:00:00.000Z"),
        submittedNote: note,
        submittedAt: new Date(),
        // A resubmission after a rejection starts a clean decision. The
        // decision it replaces is not lost — it is already in the history.
        reviewedById: null,
        reviewedAt: selfCreated ? new Date() : null,
        reviewNote: null,
        events: {
          create: {
            actorId: user.id,
            kind: "Submitted",
            note,
            // The work date, stored raw. Rendering is the client's job —
            // the API has no business deciding how a date looks.
            detail: raw,
          },
        },
      },
      include: INCLUDE,
    });
    return NextResponse.json({
      task: serialize(submitted, MANAGER_ROLES.includes(user.role)),
      selfCompleted: selfCreated,
    });
  }

  if (action === "approve" || action === "reject") {
    if (task.createdById !== user.id && user.role !== "Admin") {
      return NextResponse.json(
        { error: "Only the person who assigned this task can review it." },
        { status: 403 },
      );
    }
    if (task.status !== "Submitted") {
      return NextResponse.json(
        { error: "That task hasn't been submitted for review." },
        { status: 409 },
      );
    }
    const reviewNote =
      typeof body.reviewNote === "string" && body.reviewNote.trim()
        ? body.reviewNote.trim()
        : null;
    const reviewed = await prisma.domainTask.update({
      where: { id },
      data: {
        // A rejection goes back to the assignee to redo, rather than
        // becoming a dead end.
        status: action === "approve" ? "Approved" : "Rejected",
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote,
        events: {
          create: {
            actorId: user.id,
            kind: action === "approve" ? "Approved" : "Rejected",
            note: reviewNote,
          },
        },
      },
      include: INCLUDE,
    });
    return NextResponse.json({
      task: serialize(reviewed, MANAGER_ROLES.includes(user.role)),
    });
  }

  const data: Record<string, unknown> = {};
  let reassignedTo: string | null = null;

  if (DOMAIN_TASK_STATUSES.includes(body.status as DomainTaskStatus)) {
    data.status = body.status;
  }
  // Reassignment / retitling / scheduling is a manager action only.
  if (isManager) {
    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }
    if (typeof body.startDate === "string" || body.startDate === null) {
      data.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if (typeof body.targetDate === "string" || body.targetDate === null) {
      data.targetDate = body.targetDate ? new Date(body.targetDate) : null;
    }
    if (body.estimatedHours === null) {
      data.estimatedHours = null;
    } else if (body.estimatedHours !== undefined) {
      const n = Number(body.estimatedHours);
      data.estimatedHours =
        Number.isFinite(n) && n > 0 ? Math.min(1000, Math.round(n * 100) / 100) : null;
    }
    if (body.divisionId === null) {
      data.divisionId = null;
    } else if (body.divisionId !== undefined) {
      const d = Number(body.divisionId);
      data.divisionId = Number.isFinite(d) ? d : null;
    }
    if (body.assigneeId === null) {
      data.assigneeId = null;
    } else if (typeof body.assigneeId === "string") {
      const assignee = await prisma.domainUser.findUnique({
        where: { id: body.assigneeId },
      });
      // A task may be moved to anyone active, matching the freedom the
      // original assignment has. Approval still returns to whoever
      // assigned it, which is what keeps the trail intact.
      if (!assignee || !assignee.isActive) {
        return NextResponse.json({ error: "Invalid assignee." }, { status: 400 });
      }
      data.assigneeId = assignee.id;
      // Moving work to someone else is a real event in the task's life —
      // "why is this on my plate" is answered here and nowhere else.
      if (assignee.id !== task.assigneeId) {
        reassignedTo = assignee.name;
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.domainTask.update({
    where: { id },
    data: {
      ...data,
      ...(reassignedTo
        ? {
            events: {
              create: {
                actorId: user.id,
                kind: "Reassigned",
                detail: `to ${reassignedTo}`,
              },
            },
          }
        : {}),
    },
    include: INCLUDE,
  });
  return NextResponse.json({
    task: serialize(updated, MANAGER_ROLES.includes(user.role)),
  });
}