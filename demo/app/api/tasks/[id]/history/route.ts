import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessProject, canSeeTask, requireUser } from "@/lib/server-access";
import { decodeHistoryValue, ymd } from "@/lib/task-history";
import { shortName } from "@/lib/short-name";

/**
 * GET /api/tasks/{id}/history — what the task drawer shows beyond the task
 * itself: its key, sprint and parent task, and its change history (newest
 * first), including changes made through /api/v1 by PM Inventive.
 */
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

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      responsibleId: true,
      project: { select: { id: true, key: true } },
      parent: { select: { id: true, title: true, status: true } },
      sprint: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessProject(user, task.projectId)) || !(await canSeeTask(user, task))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.taskHistory.findMany({
    where: { taskId },
    orderBy: { at: "desc" },
    take: 300,
    include: { changedBy: { select: { name: true } } },
  });
  const onBehalfIds = [...new Set(rows.map((r) => r.onBehalfOfUserId).filter((x): x is string => !!x))];
  const onBehalf = new Map(
    (onBehalfIds.length
      ? await prisma.user.findMany({ where: { id: { in: onBehalfIds } }, select: { id: true, name: true } })
      : []
    ).map((u) => [u.id, shortName(u.name)]),
  );

  return NextResponse.json({
    key: `${task.project.key || `P${task.project.id}`}-${task.id}`,
    parent: task.parent,
    sprint: task.sprint
      ? { ...task.sprint, startDate: ymd(task.sprint.startDate), endDate: ymd(task.sprint.endDate) }
      : null,
    history: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      field: r.field,
      old: decodeHistoryValue(r.oldValue),
      new: decodeHistoryValue(r.newValue),
      by: r.changedBy ? shortName(r.changedBy.name) : null,
      onBehalfOf: r.onBehalfOfUserId ? (onBehalf.get(r.onBehalfOfUserId) ?? null) : null,
      note: r.sourceNote,
    })),
  });
}
