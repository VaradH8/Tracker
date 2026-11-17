import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { ApiError, jsonBody, routeId } from "@/lib/api-v1/http";
import { readAttribution, rejectForbiddenFields } from "@/lib/api-v1/tasks";

async function deps(taskId: number) {
  const [blockedBy, blocks] = await Promise.all([
    prisma.taskDependency.findMany({ where: { blockedTaskId: taskId }, select: { blockerTaskId: true } }),
    prisma.taskDependency.findMany({ where: { blockerTaskId: taskId }, select: { blockedTaskId: true } }),
  ]);
  return {
    blocked_by: blockedBy.map((d) => d.blockerTaskId).sort((a, b) => a - b),
    blocks: blocks.map((d) => d.blockedTaskId).sort((a, b) => a - b),
  };
}

/** Would "taskId is blocked by blockerId" close a loop? (blocker already waits on task) */
async function createsCycle(taskId: number, blockerId: number): Promise<boolean> {
  const seen = new Set<number>();
  let frontier = [blockerId];
  while (frontier.length) {
    if (frontier.includes(taskId)) return true;
    frontier.forEach((id) => seen.add(id));
    const next = await prisma.taskDependency.findMany({
      where: { blockedTaskId: { in: frontier } },
      select: { blockerTaskId: true },
    });
    frontier = [...new Set(next.map((n) => n.blockerTaskId))].filter((id) => !seen.has(id));
  }
  return false;
}

export const GET = v1<{ id: string }>(async (_req, { params }) => {
  const taskId = routeId(params.id);
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw new ApiError(404, "not_found", "Task not found");
  return NextResponse.json(await deps(taskId));
});

/** Add a blocked-by link. Same project only, no self-links, no loops. */
export const POST = v1<{ id: string }>(
  async (req, { params, user }) => {
    const taskId = routeId(params.id);
    const body = await jsonBody(req);
    rejectForbiddenFields(body, new Set(["blocked_by_id"]));
    const blockerId = Number(body.blocked_by_id);
    if (!Number.isInteger(blockerId) || blockerId < 1) {
      throw new ApiError(422, "missing_field", "blocked_by_id is required", "blocked_by_id");
    }
    if (blockerId === taskId) throw new ApiError(422, "invalid", "A task cannot block itself", "blocked_by_id");
    const attr = await readAttribution(body);
    const [task, blocker] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true, title: true, project: { select: { name: true } } } }),
      prisma.task.findUnique({ where: { id: blockerId }, select: { projectId: true, title: true } }),
    ]);
    if (!task) throw new ApiError(404, "not_found", "Task not found");
    if (!blocker) throw new ApiError(422, "invalid", "Unknown blocked_by_id task", "blocked_by_id");
    if (blocker.projectId !== task.projectId) {
      throw new ApiError(422, "invalid", "Dependencies must be within the same project", "blocked_by_id");
    }
    const exists = await prisma.taskDependency.findUnique({
      where: { blockedTaskId_blockerTaskId: { blockedTaskId: taskId, blockerTaskId: blockerId } },
    });
    if (!exists) {
      if (await createsCycle(taskId, blockerId)) {
        throw new ApiError(409, "dependency_cycle", "That link would create a dependency loop", "blocked_by_id");
      }
      await prisma.$transaction([
        prisma.taskDependency.create({ data: { blockedTaskId: taskId, blockerTaskId: blockerId } }),
        prisma.taskHistory.create({
          data: {
            taskId,
            field: "blocked_by",
            oldValue: "null",
            newValue: JSON.stringify(blockerId),
            changedById: user.id,
            onBehalfOfUserId: attr.onBehalfOfUserId,
            sourceNote: attr.sourceNote,
          },
        }),
        prisma.auditEntry.create({
          data: {
            actorId: user.id,
            action: "task.dependency_add",
            scope: task.project.name,
            taskTitle: task.title,
            after: `blocked by #${blockerId} ${blocker.title} — via ${user.name}` +
              (attr.onBehalfOfName ? ` on behalf of ${attr.onBehalfOfName}` : "") +
              (attr.sourceNote ? `: ${attr.sourceNote}` : ""),
          },
        }),
      ]);
    }
    return NextResponse.json(await deps(taskId), { status: exists ? 200 : 201 });
  },
  { idempotent: true },
);

export const DELETE = forbidDelete;
