import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  requireUser,
  visibleProjectIds,
  writeAudit,
} from "@/lib/server-access";

export async function GET(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const mineOnly = url.searchParams.get("mine") === "true";

  const ids = await visibleProjectIds(user);
  const projectFilter =
    ids === "all"
      ? undefined
      : { in: ids };

  const where: Record<string, unknown> = {};
  if (projectFilter) where.projectId = projectFilter;
  if (projectId) where.projectId = Number(projectId);
  if (mineOnly) {
    where.assignees = { some: { userId: user.id } };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignees: { include: { user: true } },
      project: true,
    },
    orderBy: [{ important: "desc" }, { targetDate: "asc" }],
  });

  return NextResponse.json(tasks);
}

const createSchema = z.object({
  title: z.string().min(1),
  projectId: z.number().int(),
  status: z.enum(["To Do", "In Progress", "Blocked", "Done"]).optional(),
  priority: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  targetDate: z.string().optional(),
  assigneeIds: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  if (!canEditTasks(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid body", details: String(e) },
      { status: 400 },
    );
  }

  if (!(await canAccessProject(user, body.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const task = await prisma.task.create({
    data: {
      title: body.title,
      projectId: body.projectId,
      status: body.status ?? "To Do",
      priority: body.priority ?? "Medium",
      targetDate: body.targetDate
        ? new Date(body.targetDate)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      important: false,
      assignees: body.assigneeIds?.length
        ? {
            create: body.assigneeIds.map((userId) => ({ userId })),
          }
        : undefined,
    },
    include: {
      assignees: { include: { user: true } },
      project: true,
    },
  });

  await writeAudit(user.id, "task.create", {
    scope: task.project.name,
    taskTitle: task.title,
  });

  return NextResponse.json(task, { status: 201 });
}
