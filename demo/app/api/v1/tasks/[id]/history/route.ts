import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { fmtTs, pageParams, paginated, routeId } from "@/lib/api-v1/http";
import { loadTask } from "@/lib/api-v1/tasks";

function parse(v: string | null): unknown {
  if (v === null) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/**
 * Field-level change log, oldest first. Covers every change made through
 * /api/v1; changes made in the UI are in the project's History tab.
 */
export const GET = v1<{ id: string }>(async (_req, { params, url }) => {
  const taskId = routeId(params.id);
  await loadTask(taskId);
  const page = pageParams(url);
  const [rows, total] = await Promise.all([
    prisma.taskHistory.findMany({
      where: { taskId },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      skip: page.skip,
      take: page.pageSize,
    }),
    prisma.taskHistory.count({ where: { taskId } }),
  ]);
  return paginated(
    rows.map((h) => ({
      id: h.id,
      at: fmtTs(h.at),
      field: h.field,
      old: parse(h.oldValue),
      new: parse(h.newValue),
      changed_by: h.changedById,
      on_behalf_of_user_id: h.onBehalfOfUserId,
      source_note: h.sourceNote,
    })),
    total,
    page,
  );
});
export const DELETE = forbidDelete;
