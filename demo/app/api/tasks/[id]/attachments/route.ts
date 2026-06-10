import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  isTaskAssignee,
  requireUser,
} from "@/lib/server-access";
import { serializeAttachment } from "@/lib/serializers";

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
    select: { projectId: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessProject(user, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const editor = canEditTasks(user.role);
  const assignee = await isTaskAssignee(user.id, taskId);
  if (!editor && !assignee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const size = String(body.size ?? "?").trim();
  const kind = String(body.kind ?? "other");
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const created = await prisma.taskAttachment.create({
    data: { taskId, name, size, kind, uploadedById: user.id },
    include: { uploadedBy: true },
  });
  return NextResponse.json(
    { attachment: serializeAttachment(created) },
    { status: 201 },
  );
}
