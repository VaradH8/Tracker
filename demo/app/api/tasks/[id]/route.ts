import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canManageProjectTasks,
  canSeeTask,
  completedAtUpdate,
  isTaskAssignee,
  requireUser,
  userByFirstName,
  writeAudit,
} from "@/lib/server-access";
import { serializeTask } from "@/lib/serializers";

const TASK_INCLUDE = {
  assignees: { include: { user: true } },
  responsible: true,
  approvedBy: true,
  remarks: { include: { author: true }, orderBy: { createdAt: "asc" as const } },
  attachments: { include: { uploadedBy: true } },
  blockedBy: true,
} as const;

export async function GET(
  _req: Request,
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
    include: TASK_INCLUDE,
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessProject(user, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Assignment-based visibility: within an accessible project, a
  // non-oversight user may only open their own tasks.
  if (!(await canSeeTask(user, task))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ task: serializeTask(task) });
}

export async function PATCH(
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

  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessProject(user, existing.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAssignee = await isTaskAssignee(user.id, taskId);
  // Per-project authority: global Admin/Coord OR per-project Lead/Coord
  // on this task's project. A BD who created the project is an
  // editor here; a global Developer who is just an assignee is not.
  const editor = await canManageProjectTasks(user, existing.projectId);
  // Assignees may flip status / log time / post remarks; broader edits
  // (title, description, priority, target date, responsible, important,
  // estimate, approve) need Admin/Coordinator.
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    if (!editor && !isAssignee) {
      return NextResponse.json(
        { error: "Only assignees + co-ordinators can change status." },
        { status: 403 },
      );
    }
    data.status = body.status;
    // Stamp / clear the completion time so the task settles into the
    // week it was finished on the weekly board.
    const completedAt = completedAtUpdate(existing.status, body.status);
    if (completedAt !== undefined) data.completedAt = completedAt;
  }
  if (editor) {
    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }
    if (typeof body.description === "string" || body.description === null) {
      data.description = body.description;
    }
    if (typeof body.priority === "string") data.priority = body.priority;
    if (typeof body.targetDate === "string") {
      data.targetDate = new Date(body.targetDate);
    }
    if (typeof body.startDate === "string" || body.startDate === null) {
      data.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if (typeof body.important === "boolean") data.important = body.important;
    if (
      typeof body.estimatedHours === "number" ||
      body.estimatedHours === null
    ) {
      data.estimatedHours = body.estimatedHours;
    }
    if (typeof body.actualHours === "number") {
      data.actualHours = body.actualHours;
    }
    if (
      typeof body.responsible === "string" ||
      body.responsible === null
    ) {
      if (body.responsible === null) {
        data.responsibleId = null;
      } else {
        const u = await userByFirstName(body.responsible);
        if (u) data.responsibleId = u.id;
      }
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data,
    include: TASK_INCLUDE,
  });

  if (data.status && data.status !== existing.status) {
    await writeAudit(user.id, "task.status_change", {
      scope: existing.project.name,
      taskTitle: existing.title,
      before: existing.status,
      after: String(data.status),
    });
  }
  if (
    typeof data.important === "boolean" &&
    data.important !== existing.important
  ) {
    await writeAudit(user.id, "task.mark_important", {
      scope: existing.project.name,
      taskTitle: existing.title,
      before: String(existing.important),
      after: String(data.important),
    });
  }

  return NextResponse.json({ task: serializeTask(updated) });
}

export async function DELETE(
  _req: Request,
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
  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canManageProjectTasks(user, existing.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.task.delete({ where: { id: taskId } });
  await writeAudit(user.id, "task.delete", {
    scope: existing.project.name,
    taskTitle: existing.title,
  });
  return NextResponse.json({ ok: true });
}
