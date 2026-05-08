import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  requireUser,
  writeAudit,
} from "@/lib/server-access";

async function loadTask(id: number) {
  return prisma.task.findUnique({
    where: { id },
    include: {
      assignees: { include: { user: true } },
      project: true,
      remarks: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

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

  const task = await loadTask(taskId);
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessProject(user, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(task);
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  priority: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  targetDate: z.string().optional(),
  important: z.boolean().optional(),
  assigneeIds: z.array(z.string()).optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  if (!canEditTasks(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await context.params;
  const taskId = Number(idStr);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await loadTask(taskId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessProject(user, existing.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid body", details: String(e) },
      { status: 400 },
    );
  }

  // Special-case: assignee replacement
  if (body.assigneeIds) {
    await prisma.taskAssignee.deleteMany({ where: { taskId } });
    await prisma.taskAssignee.createMany({
      data: body.assigneeIds.map((userId) => ({ taskId, userId })),
    });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      title: body.title,
      description: body.description ?? undefined,
      priority: body.priority,
      targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
      important: body.important,
    },
    include: {
      assignees: { include: { user: true } },
      project: true,
      remarks: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (body.important !== undefined && body.important !== existing.important) {
    await writeAudit(user.id, "task.mark_important", {
      scope: existing.project.name,
      taskTitle: existing.title,
      before: String(existing.important),
      after: String(body.important),
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  if (!canEditTasks(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await context.params;
  const taskId = Number(idStr);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await loadTask(taskId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessProject(user, existing.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.task.delete({ where: { id: taskId } });
  await writeAudit(user.id, "task.delete", {
    scope: existing.project.name,
    taskTitle: existing.title,
  });

  return NextResponse.json({ ok: true });
}
