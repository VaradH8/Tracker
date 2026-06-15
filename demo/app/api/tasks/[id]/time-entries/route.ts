import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  isTaskAssignee,
  requireUser,
} from "@/lib/server-access";
import { serializeTimeEntry } from "@/lib/serializers";

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
    select: { projectId: true, actualHours: true },
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
  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: "Enter a positive hours value." }, { status: 400 });
  }
  const date = body.date ? new Date(String(body.date)) : new Date();
  const note = typeof body.note === "string" ? body.note : null;

  const [entry] = await prisma.$transaction([
    prisma.timeEntry.create({
      data: { taskId, userId: user.id, hours, date, note },
      include: { user: true },
    }),
    prisma.task.update({
      where: { id: taskId },
      data: { actualHours: (task.actualHours ?? 0) + hours },
    }),
  ]);
  return NextResponse.json(
    { entry: serializeTimeEntry(entry) },
    { status: 201 },
  );
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
  // Cross-project leak protection — only let people on this project
  // see who's logged time on its tasks.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canAccessProject(user, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const entries = await prisma.timeEntry.findMany({
    where: { taskId },
    include: { user: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ entries: entries.map(serializeTimeEntry) });
}
