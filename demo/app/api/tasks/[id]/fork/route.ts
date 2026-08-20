import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  isProjectMember,
  notifyUser,
  requireUser,
  visibleProjectIds,
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

/**
 * POST /api/tasks/:id/fork — take your own copy of somebody else's task.
 *
 * The fork is an independent task assigned to whoever forked it, carrying a
 * pointer back to the original. The original is never touched: its assignees,
 * status and dates stay exactly as they were, so both can run in parallel and
 * the person who forked doesn't quietly take work off someone's plate.
 *
 * Deliberately NOT copied: status (a fork starts at To Do, not half-done),
 * actual hours, remarks, attachments, approvals and dependencies. Those belong
 * to the original's history, not to a fresh piece of work.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Bad task id." }, { status: 400 });
  }

  const source = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true, project: true },
  });
  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Forking is bounded by the same project scope as everything else: you may
  // fork work on a project you belong to, and nothing outside it.
  const ids = await visibleProjectIds(user);
  const inScope = ids === "all" || ids.includes(source.projectId);
  if (!inScope || !(await isProjectMember(user.id, source.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Forking your own work would just duplicate it.
  const alreadyMine =
    source.responsibleId === user.id ||
    source.assignees.some((a) => a.userId === user.id);
  if (alreadyMine) {
    return NextResponse.json(
      { error: "This is already your task — no need to fork it." },
      { status: 400 },
    );
  }

  const fork = await prisma.task.create({
    data: {
      title: source.title,
      description: source.description,
      projectId: source.projectId,
      priority: source.priority,
      status: "To Do",
      startDate: source.startDate,
      targetDate: source.targetDate,
      estimatedHours: source.estimatedHours,
      important: source.important,
      responsibleId: user.id,
      forkedFromId: source.id,
      forkedAt: new Date(),
      assignees: { create: [{ userId: user.id }] },
    },
    include: { ...TASK_INCLUDE, project: true },
  });

  await writeAudit(user.id, "task.fork", {
    scope: fork.project.name,
    taskTitle: fork.title,
    before: `#${source.id}`,
    after: `#${fork.id}`,
  });

  // Tell the people holding the original that someone has picked the work up
  // alongside them. Their task is unchanged, but they should know.
  const notify = new Set(
    [
      source.responsibleId,
      ...source.assignees.map((a) => a.userId),
    ].filter((uid): uid is string => Boolean(uid) && uid !== user.id),
  );
  await Promise.all(
    Array.from(notify).map((uid) =>
      notifyUser(uid, {
        kind: "forked",
        title: "Your task was forked",
        body: source.title,
        taskId: fork.id,
        actorName: user.name,
        baseUrl: new URL(req.url).origin,
      }),
    ),
  );

  return NextResponse.json({ task: serializeTask(fork) }, { status: 201 });
}
