import { NextResponse } from "next/server";
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
    // Close any existing open interval (this task or another). Rolls
    // those hours into their own task before opening the new one.
    const openOnAny = await prisma.timeEntry.findMany({
      where: { userId: user.id, endedAt: null, startedAt: { not: null } },
    });
    for (const e of openOnAny) {
      const startedAt = e.startedAt ?? e.createdAt;
      const hours = Math.max(
        0,
        (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60),
      );
      await prisma.$transaction([
        prisma.timeEntry.update({
          where: { id: e.id },
          data: { endedAt: now, hours },
        }),
        prisma.task.update({
          where: { id: e.taskId },
          data: {
            actualHours: { increment: hours },
          },
        }),
      ]);
    }
    const opened = await prisma.timeEntry.create({
      data: {
        taskId,
        userId: user.id,
        date: now,
        startedAt: now,
      },
      include: { user: true },
    });
    // Starting a timer on a "To Do" task naturally flips it to In Progress.
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
    const hours = Math.max(
      0,
      (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60),
    );
    await prisma.$transaction([
      prisma.timeEntry.update({
        where: { id: open.id },
        data: { endedAt: now, hours },
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
