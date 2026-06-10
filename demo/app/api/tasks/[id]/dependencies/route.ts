import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  requireUser,
} from "@/lib/server-access";

/** POST { dependsOnId } — toggle a "this task is blocked by X" link. */
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
  const depId = Number(body.dependsOnId);
  if (!Number.isFinite(depId) || depId === taskId) {
    return NextResponse.json({ error: "Invalid dependsOnId." }, { status: 400 });
  }

  const existing = await prisma.taskDependency.findUnique({
    where: {
      blockedTaskId_blockerTaskId: {
        blockedTaskId: taskId,
        blockerTaskId: depId,
      },
    },
  });
  if (existing) {
    await prisma.taskDependency.delete({
      where: {
        blockedTaskId_blockerTaskId: {
          blockedTaskId: taskId,
          blockerTaskId: depId,
        },
      },
    });
  } else {
    await prisma.taskDependency.create({
      data: { blockedTaskId: taskId, blockerTaskId: depId },
    });
  }

  const updated = await prisma.task.findUnique({
    where: { id: taskId },
    include: { blockedBy: true },
  });
  return NextResponse.json({
    dependsOn: updated?.blockedBy.map((d) => d.blockerTaskId) ?? [],
  });
}
