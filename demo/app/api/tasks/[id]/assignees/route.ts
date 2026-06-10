import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  requireUser,
  userByFirstName,
} from "@/lib/server-access";

/**
 * POST { name, action: "add" | "remove" | "toggle" }
 * Returns the new assignees list.
 */
export async function POST(
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
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessProject(user, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "");
  const action: "add" | "remove" | "toggle" = body.action ?? "toggle";

  const target = await userByFirstName(name);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const existing = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId: target.id } },
  });

  if (
    (action === "remove" && existing) ||
    (action === "toggle" && existing)
  ) {
    await prisma.taskAssignee.delete({
      where: { taskId_userId: { taskId, userId: target.id } },
    });
  } else if (
    (action === "add" && !existing) ||
    (action === "toggle" && !existing)
  ) {
    await prisma.taskAssignee.create({
      data: { taskId, userId: target.id },
    });
  }

  const updated = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { include: { user: true } } },
  });
  return NextResponse.json({
    assignees:
      updated?.assignees.map((a) => a.user.name.split(" ")[0]) ?? [],
  });
}
