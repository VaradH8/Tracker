import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  isTaskAssignee,
  requireUser,
  writeAudit,
} from "@/lib/server-access";
import { serializeTask, serializeTimeEntry } from "@/lib/serializers";

const TASK_INCLUDE = {
  assignees: { include: { user: true } },
  responsible: true,
  approvedBy: true,
  remarks: { include: { author: true }, orderBy: { createdAt: "asc" as const } },
  attachments: { include: { uploadedBy: true } },
  blockedBy: true,
} as const;

/** Safety cap on any single interval. A timer that someone forgot to
 *  stop shouldn't credit 72 hours to the task on the next Stop — that
 *  one mistake would skew the project's whole rollup. We close runaway
 *  intervals at this many hours; anything beyond requires a manual
 *  correction. */
const MAX_INTERVAL_HOURS = 12;

/** Compute the capped credit for an interval. Returns the capped hours
 *  plus a flag so the caller can append a note explaining the cap. */
function creditedHours(startedAt: Date, now: Date) {
  const raw = Math.max(0, (now.getTime() - startedAt.getTime()) / 3_600_000);
  if (raw <= MAX_INTERVAL_HOURS) return { hours: raw, capped: false };
  return { hours: MAX_INTERVAL_HOURS, capped: true };
}

/**
 * POST /api/tasks/[id]/timer
 *   { action: "start" } — open a new TimeEntry interval for this user
 *     on this task. If the user already has an open interval (on this
 *     task or any other), close it first so a person can only be
 *     timing one thing at once.
 *   { action: "stop" } — close the user's open interval on THIS task.
 *     Computes hours and rolls them into Task.actualHours.
 *   { action: "done" } — stop + flip task status to Done.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr } = await context.params;
  const taskId = Number(idStr);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessProject(user, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Assignees + Admin/Coord can run the timer.
  const editor = canEditTasks(user.role);
  const assignee = await isTaskAssignee(user.id, taskId);
  if (!editor && !assignee) {
    return NextResponse.json(
      { error: "You're not assigned to this task." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const action: "start" | "stop" | "done" = body.action;
  if (action !== "start" && action !== "stop" && action !== "done") {
    return NextResponse.json({ error: "Bad action" }, { status: 400 });
  }

  const now = new Date();

  if (action === "start") {
    // First, close every open interval this user has anywhere. This
    // enforces the "one running timer at a time" invariant, AND it
    // clears the way for the partial unique index defined in
    // prisma/post-push.sql (`TimeEntry_one_open_per_user`).
    const openOnAny = await prisma.timeEntry.findMany({
      where: { userId: user.id, endedAt: null, startedAt: { not: null } },
    });
    for (const e of openOnAny) {
      const startedAt = e.startedAt ?? e.createdAt;
      const { hours, capped } = creditedHours(startedAt, now);
      await prisma.$transaction([
        prisma.timeEntry.update({
          where: { id: e.id },
          data: {
            endedAt: now,
            hours,
            note: capped
              ? (e.note ?? "") +
                ` [auto-stopped — timer was running >${MAX_INTERVAL_HOURS}h]`
              : e.note,
          },
        }),
        prisma.task.update({
          where: { id: e.taskId },
          data: { actualHours: { increment: hours } },
        }),
      ]);
    }

    // Now try to open the new interval. Under concurrency, two clicks
    // can race past the cleanup above — the partial unique index then
    // makes the *second* create fail with P2002, and we just return
    // whatever interval is currently open.
    try {
      const opened = await prisma.timeEntry.create({
        data: { taskId, userId: user.id, date: now, startedAt: now },
        include: { user: true },
      });
      if (task.status === "To Do") {
        await prisma.task.update({
          where: { id: taskId },
          data: { status: "In Progress" },
        });
        await writeAudit(user.id, "task.status_change", {
          scope: task.project.name,
          taskTitle: task.title,
          before: "To Do",
          after: "In Progress",
        });
      }
      const updated = await prisma.task.findUnique({
        where: { id: taskId },
        include: TASK_INCLUDE,
      });
      return NextResponse.json({
        entry: serializeTimeEntry(opened),
        activeStartedAt: opened.startedAt!.toISOString(),
        activeTaskId: opened.taskId,
        task: updated ? serializeTask(updated) : null,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // A concurrent Start beat us. Treat as a no-op and report the
        // currently-open interval back to the client.
        const existing = await prisma.timeEntry.findFirst({
          where: { userId: user.id, endedAt: null },
          orderBy: { startedAt: "desc" },
          include: { user: true },
        });
        const updated = await prisma.task.findUnique({
          where: { id: taskId },
          include: TASK_INCLUDE,
        });
        return NextResponse.json({
          entry: existing ? serializeTimeEntry(existing) : null,
          activeStartedAt: existing?.startedAt?.toISOString() ?? null,
          activeTaskId: existing?.taskId ?? null,
          task: updated ? serializeTask(updated) : null,
        });
      }
      throw e;
    }
  }

  // STOP / DONE — find this user's open interval on this task.
  const open = await prisma.timeEntry.findFirst({
    where: {
      userId: user.id,
      taskId,
      endedAt: null,
      startedAt: { not: null },
    },
    orderBy: { startedAt: "desc" },
  });
  if (open) {
    const startedAt = open.startedAt ?? open.createdAt;
    const { hours, capped } = creditedHours(startedAt, now);
    await prisma.$transaction([
      prisma.timeEntry.update({
        where: { id: open.id },
        data: {
          endedAt: now,
          hours,
          note: capped
            ? (open.note ?? "") +
              ` [auto-stopped — timer was running >${MAX_INTERVAL_HOURS}h]`
            : open.note,
        },
      }),
      prisma.task.update({
        where: { id: taskId },
        data: { actualHours: { increment: hours } },
      }),
    ]);
  }

  if (action === "done" && task.status !== "Done") {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "Done" },
    });
    await writeAudit(user.id, "task.status_change", {
      scope: task.project.name,
      taskTitle: task.title,
      before: task.status,
      after: "Done",
    });
  }

  const updated = await prisma.task.findUnique({
    where: { id: taskId },
    include: TASK_INCLUDE,
  });

  return NextResponse.json({
    task: updated ? serializeTask(updated) : null,
  });
}
