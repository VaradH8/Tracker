import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import {
  DOMAIN_TASK_STATUSES,
  WORKING_ROLES,
  type DomainRole,
  type DomainTaskStatus,
} from "@/lib/domain";

const INCLUDE = {
  project: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

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
  const data: Record<string, unknown> = {};

  if (DOMAIN_TASK_STATUSES.includes(body.status as DomainTaskStatus)) {
    data.status = body.status;
  }
  // Reassignment / retitling / scheduling is a manager action only.
  if (isManager) {
    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }
    if (typeof body.targetDate === "string" || body.targetDate === null) {
      data.targetDate = body.targetDate ? new Date(body.targetDate) : null;
    }
    if (body.assigneeId === null) {
      data.assigneeId = null;
    } else if (typeof body.assigneeId === "string") {
      const assignee = await prisma.domainUser.findUnique({
        where: { id: body.assigneeId },
      });
      if (
        !assignee ||
        !assignee.isActive ||
        !WORKING_ROLES.includes(assignee.role as DomainRole)
      ) {
        return NextResponse.json({ error: "Invalid assignee." }, { status: 400 });
      }
      data.assigneeId = assignee.id;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.domainTask.update({
    where: { id },
    data,
    include: INCLUDE,
  });
  return NextResponse.json({
    task: {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      targetDate: updated.targetDate
        ? updated.targetDate.toISOString().slice(0, 10)
        : null,
      projectId: updated.project.id,
      projectName: updated.project.name,
      assignee: updated.assignee?.name ?? null,
      assigneeId: updated.assignee?.id ?? null,
      createdBy: updated.createdBy.name,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}