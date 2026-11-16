import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { ApiError, fmtTs, jsonBody, pageParams, paginated, routeId } from "@/lib/api-v1/http";
import { loadTask, readAttribution, rejectForbiddenFields } from "@/lib/api-v1/tasks";

type RemarkRow = {
  id: number;
  body: string;
  authorId: string;
  createdAt: Date;
  onBehalfOfUserId: string | null;
  sourceNote: string | null;
};

function serializeComment(r: RemarkRow) {
  return {
    id: r.id,
    text: r.body,
    author_id: r.authorId,
    created_at: fmtTs(r.createdAt),
    on_behalf_of_user_id: r.onBehalfOfUserId,
    source_note: r.sourceNote,
  };
}

/** Task comments (the tracker calls them remarks), oldest first. */
export const GET = v1<{ id: string }>(async (_req, { params, url }) => {
  const taskId = routeId(params.id);
  await loadTask(taskId);
  const page = pageParams(url);
  const [rows, total] = await Promise.all([
    prisma.remark.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: page.skip,
      take: page.pageSize,
    }),
    prisma.remark.count({ where: { taskId } }),
  ]);
  return paginated(rows.map(serializeComment), total, page);
});

/** Add a comment as the service account. Comments can't be edited or deleted (S-3). */
export const POST = v1<{ id: string }>(
  async (req, { params, user }) => {
    const taskId = routeId(params.id);
    const body = await jsonBody(req);
    rejectForbiddenFields(body, new Set(["text"]));
    if (typeof body.text !== "string" || !body.text.trim()) {
      throw new ApiError(422, "missing_field", "text is required", "text");
    }
    if (body.text.length > 5000) throw new ApiError(422, "invalid", "text must be at most 5000 characters", "text");
    const attr = await readAttribution(body);
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, project: { select: { name: true } } },
    });
    if (!task) throw new ApiError(404, "not_found", "Task not found");

    const remark = await prisma.$transaction(async (tx) => {
      const r = await tx.remark.create({
        data: {
          taskId,
          authorId: user.id,
          body: body.text as string,
          onBehalfOfUserId: attr.onBehalfOfUserId,
          sourceNote: attr.sourceNote,
        },
      });
      await tx.taskHistory.create({
        data: {
          taskId,
          field: "comment",
          oldValue: "null",
          newValue: JSON.stringify(r.id),
          changedById: user.id,
          onBehalfOfUserId: attr.onBehalfOfUserId,
          sourceNote: attr.sourceNote,
        },
      });
      return r;
    });
    return NextResponse.json(serializeComment(remark), { status: 201 });
  },
  { idempotent: true },
);

export const DELETE = forbidDelete;
