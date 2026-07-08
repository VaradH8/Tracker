import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  completedAtUpdate,
  isTaskAssignee,
  requireUser,
  writeAudit,
} from "@/lib/server-access";

const schema = z.object({
  status: z.enum(["To Do", "In Progress", "Blocked", "In review", "Done"]),
  actualHours: z.number().optional(),
  blockerReason: z.string().optional(),
});

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
  if (!canEditTasks(user.role) && !isAssignee) {
    return NextResponse.json(
      { error: "Only assignees and co-ordinators can change status" },
      { status: 403 },
    );
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid body", details: String(e) },
      { status: 400 },
    );
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: body.status,
      actualHours: body.actualHours ?? undefined,
      completedAt: completedAtUpdate(existing.status, body.status),
    },
    include: { assignees: { include: { user: true } }, project: true },
  });

  await writeAudit(user.id, "task.status_change", {
    scope: existing.project.name,
    taskTitle: existing.title,
    before: existing.status,
    after: body.status,
  });

  if (body.status === "Blocked" && body.blockerReason) {
    await prisma.remark.create({
      data: {
        taskId,
        authorId: user.id,
        body: `Blocked: ${body.blockerReason}`,
      },
    });
  }

  return NextResponse.json(updated);
}
