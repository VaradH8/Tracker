import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  canManageUsers,
  requireUser,
} from "@/lib/server-access";
import { serializeProject } from "@/lib/serializers";

const PROJECT_INCLUDE = {
  client: true,
  lead: true,
  members: { include: { user: true } },
  _count: { select: { tasks: true } },
} as const;

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr } = await context.params;
  const projectId = Number(idStr);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (!(await canAccessProject(user, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: PROJECT_INCLUDE,
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ project: serializeProject(project) });
}

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
  const projectId = Number(idStr);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.coordinator === "string") data.coordinatorName = body.coordinator;
  if (typeof body.bd === "string") data.bdName = body.bd;
  if (typeof body.startDate === "string") data.startDate = new Date(body.startDate);
  if (typeof body.targetDate === "string") data.targetDate = new Date(body.targetDate);
  if (typeof body.budgetHours === "number") data.budgetHours = body.budgetHours;
  if (typeof body.loggedHours === "number") data.loggedHours = body.loggedHours;
  if (typeof body.progress === "number") data.progress = body.progress;
  if (typeof body.health === "string") data.health = body.health;
  if (typeof body.description === "string" || body.description === null) {
    data.description = body.description;
  }
  if (typeof body.leadId === "string" || body.leadId === null) {
    data.leadId = body.leadId;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data,
    include: PROJECT_INCLUDE,
  });

  return NextResponse.json({ project: serializeProject(updated) });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await context.params;
  const projectId = Number(idStr);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await prisma.project.delete({ where: { id: projectId } });
  return NextResponse.json({ ok: true });
}
