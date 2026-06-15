import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  requireUser,
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

/** POST = sign-off on a Done task. Allowed for Coord/Admin, the task's
 *  Person Responsible, or the project Lead. */
export async function POST(
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
  if (!(await canAccessProject(user, existing.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const leadRow = await prisma.projectMember.findFirst({
    where: {
      projectId: existing.projectId,
      userId: user.id,
      role: "Lead",
    },
    select: { userId: true },
  });
  const isLead = leadRow !== null;
  const isResponsible = existing.responsibleId === user.id;
  if (!canEditTasks(user.role) && !isLead && !isResponsible) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { approvedById: user.id, approvedAt: new Date() },
    include: TASK_INCLUDE,
  });
  await writeAudit(user.id, "task.approve", {
    scope: existing.project.name,
    taskTitle: existing.title,
  });
  return NextResponse.json({ task: serializeTask(updated) });
}

/** DELETE = revoke approval (admin/coord only). */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canEditTasks(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: idStr } = await context.params;
  const taskId = Number(idStr);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { approvedById: null, approvedAt: null },
    include: TASK_INCLUDE,
  });
  return NextResponse.json({ task: serializeTask(updated) });
}
