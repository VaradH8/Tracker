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
import {
  isReviewer,
  resetsOtherReviewers,
  statusOnDecision,
  statusOnSubmit,
  type ReviewDecision,
} from "@/lib/domain-task-review";
import { hoursSpentIssue, parseHoursSpent } from "@/lib/domain-task-hours";


const MANAGER_ROLES: DomainRole[] = ["Admin", "Lead", "TeamLead"];

/**
 * Delete a task.
 *
 * Whoever handed it out can withdraw it, whatever their role — a task you
 * created in error is yours to take back, and an Actionee who picked up
 * their own work should not need a manager to undo it. Managers may also
 * delete tasks they did not create, since somebody has to be able to
 * clear up after someone who has left.
 *
 * Work logs that referenced the task keep their hours; the link just goes
 * null. The task's history goes with it — see the note below.
 */
export async function DELETE(
  _req: Request,
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

  const task = await prisma.domainTask.findUnique({
    where: { id },
    select: { id: true, createdById: true, assigneeId: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isCreator = task.createdById === user.id;
  if (!isCreator && !MANAGER_ROLES.includes(user.role)) {
    return NextResponse.json(
      { error: "Only the person who created this task, or a manager, can delete it." },
      { status: 403 },
    );
  }

  /**
   * Deleting takes the task's history with it (DomainTaskEvent cascades).
   * That is right for withdrawing work that was never done, and it is why
   * the button is behind a confirm: an approved task's trail is the record
   * that it happened.
   */
  await prisma.domainTask.delete({ where: { id } });
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
  /**
   * A named reviewer has to get through the door.
   *
   * This gate was written when the only person who could sign a task off
   * was the manager who handed it out, so manager-or-assignee covered
   * everyone. Naming reviewers broke that: an SME asked to check a
   * drawing is neither, and was refused before the approve branch could
   * even look at them. Being named lets you in; whether you may actually
   * decide is still settled below.
   */
  const namedReviewer =
    (await prisma.domainTaskReviewer.count({
      where: { taskId: id, userId: user.id },
    })) > 0;
  const isCreatorOfTask = task.createdById === user.id;
  if (!isManager && !isAssignee && !namedReviewer && !isCreatorOfTask) {
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
    const hoursIssue = hoursSpentIssue(body.hoursSpent);
    if (hoursIssue) {
      return NextResponse.json({ error: hoursIssue }, { status: 400 });
    }

    /**
     * Nobody to ask means nobody to wait for.
     *
     * This used to turn on whether you created the task yourself, which
     * was a near-enough proxy while the only reviewer was the assigner.
     * It is the wrong question now: somebody can hand you work and name no
     * reviewer, and you can give yourself work and ask your Lead to check
     * it. What decides is whether anybody was actually asked.
     */
    const reviewers = await prisma.domainTaskReviewer.findMany({
      where: { taskId: id },
      select: { userId: true, decision: true },
    });
    const nextStatus = statusOnSubmit(
      reviewers.map((r) => ({
        userId: r.userId,
        decision: r.decision as ReviewDecision,
      })),
    );
    const closedOnSubmit = nextStatus === "Approved";

    const submitted = await prisma.domainTask.update({
      where: { id },
      data: {
        status: nextStatus,
        submittedOn: new Date(raw + "T00:00:00.000Z"),
        submittedNote: note,
        submittedAt: new Date(),
        hoursSpent: parseHoursSpent(body.hoursSpent),
        // A resubmission after a rejection starts a clean decision. The
        // decision it replaces is not lost — it is already in the history.
        reviewedById: null,
        reviewedAt: closedOnSubmit ? new Date() : null,
        reviewNote: null,
        // Every reviewer starts again. What comes back after a correction
        // is not the work anybody looked at, and with any-one-approves a
        // single stale approval would close the task on resubmission
        // without anybody reading the fix.
        reviewers: {
          updateMany: {
            where: { taskId: id },
            data: { decision: "Pending", decidedAt: null, note: null },
          },
        },
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
      selfCompleted: closedOnSubmit,
    });
  }

  if (action === "approve" || action === "reject") {
    /**
     * A named reviewer, or whoever assigned it. See canDecide.
     *
     * An Admin who is neither is not exempt: approving work you were not
     * asked to check, on a task you did not raise, puts a name against a
     * review that never happened.
     */
    const reviewerRows = await prisma.domainTaskReviewer.findMany({
      where: { taskId: id },
      select: { userId: true, decision: true },
    });
    const reviewers = reviewerRows.map((r) => ({
      userId: r.userId,
      decision: r.decision as ReviewDecision,
    }));
    if (!isReviewer(reviewers, user.id) && task.createdById !== user.id) {
      return NextResponse.json(
        { error: "You weren't asked to review this task." },
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
    const decision: ReviewDecision =
      action === "approve" ? "Approved" : "Rejected";

    const reviewed = await prisma.domainTask.update({
      where: { id },
      data: {
        /**
         * Approving closes it outright — any one reviewer is enough.
         * Sending it back returns it to the assignee to redo rather than
         * becoming a dead end: work that came back wrong is still work
         * somebody wants, and a terminal state would mean raising the
         * whole task again to say "fix the one sheet".
         */
        status: statusOnDecision(decision),
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote,
        reviewers: {
          // This reviewer's own decision, recorded against their name.
          updateMany: [
            {
              where: { taskId: id, userId: user.id },
              data: { decision, decidedAt: new Date(), note: reviewNote },
            },
            // A send-back wipes everybody else's, so the corrected work
            // is genuinely re-reviewed rather than inheriting an opinion
            // about a different submission.
            ...(resetsOtherReviewers(decision)
              ? [
                  {
                    where: { taskId: id, userId: { not: user.id } },
                    data: {
                      decision: "Pending",
                      decidedAt: null,
                      note: null,
                    },
                  },
                ]
              : []),
          ],
        },
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
  /**
   * Changing the brief is the assigner's to do, or a manager's.
   *
   * It used to be managers only, which locked out the one person who most
   * obviously owns a task: whoever wrote it. An Actionee who gave
   * themselves work could not correct their own title, and a Team Lead
   * could edit a task they had never seen.
   *
   * The assignee is not included. They act on the brief; rewriting the
   * thing you were asked to do, and then reporting it done, is not an
   * edit anybody wants to discover afterwards.
   */
  const isCreator = isCreatorOfTask;

  /**
   * Say no out loud.
   *
   * Without this the brief block is simply skipped for an assignee, `data`
   * comes out empty and they get "Nothing to update" — a 400 that reads
   * like their request was malformed when in fact it was refused. Anyone
   * debugging it, or any client deciding whether to show an Edit button,
   * would draw the wrong conclusion.
   */
  const BRIEF_FIELDS = [
    "title",
    "description",
    "startDate",
    "targetDate",
    "estimatedHours",
    "includesWeekends",
    "divisionId",
    "assigneeId",
  ];
  if (!isManager && !isCreator && BRIEF_FIELDS.some((f) => f in body)) {
    return NextResponse.json(
      { error: "Only the person who assigned this task, or a manager, can change it." },
      { status: 403 },
    );
  }

  /**
   * The brief is fixed once the task is signed off.
   *
   * The card has hidden its Edit button on an approved task from the
   * start, on the reasoning that rewriting the question afterwards leaves
   * a signature sitting beneath something nobody agreed to. The server
   * never checked, so the rule held only as long as everybody used the
   * button — which is not a rule, it is an honour system with a UI.
   *
   * Deleting is still allowed, and is not the same thing: it takes the
   * approval away with the words, so nothing is left to be misread.
   */
  if (task.status === "Approved" && BRIEF_FIELDS.some((f) => f in body)) {
    return NextResponse.json(
      {
        error:
          "This task has been approved, so its brief is fixed. You can delete it if it shouldn't stand.",
      },
      { status: 409 },
    );
  }

  if (isManager || isCreator) {
    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }
    // The note carries the actual instruction, so it has to be correctable
    // — a typo in the title is cosmetic, a wrong sheet number is not.
    if (typeof body.description === "string" || body.description === null) {
      data.description = body.description
        ? String(body.description).trim()
        : null;
    }
    if (typeof body.startDate === "string" || body.startDate === null) {
      data.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if (typeof body.targetDate === "string" || body.targetDate === null) {
      data.targetDate = body.targetDate ? new Date(body.targetDate) : null;
    }
    if (typeof body.includesWeekends === "boolean") {
      data.includesWeekends = body.includesWeekends;
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

  /**
   * Only a change to the brief counts as an edit.
   *
   * Moving the status is the task being worked, not rewritten, and
   * stamping "edited" on every submission would make the chip meaningless
   * within a week — which is the usual fate of a marker that fires on
   * everything.
   */
  const changedBrief = BRIEF_FIELDS.some((f) => f in data);

  const updated = await prisma.domainTask.update({
    where: { id },
    data: {
      ...data,
      ...(changedBrief
        ? { editedAt: new Date(), editedById: user.id }
        : {}),
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