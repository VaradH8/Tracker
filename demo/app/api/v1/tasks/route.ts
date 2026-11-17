import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import {
  ApiError,
  boolParam,
  dateParam,
  intParam,
  jsonBody,
  pageParams,
  paginated,
  timestampParam,
} from "@/lib/api-v1/http";
import { TASK_INCLUDE, canonicalStatus, serializeTask } from "@/lib/api-v1/serialize";
import { createTask, readAttribution } from "@/lib/api-v1/tasks";

/** Task search (PRD 5.3). All filters optional, combined with AND. */
export const GET = v1(async (_req, { url }) => {
  const page = pageParams(url);
  const where: Prisma.TaskWhereInput[] = [];

  const projectId = intParam(url, "project_id");
  if (projectId) where.push({ projectId });
  const sprintId = intParam(url, "sprint_id");
  if (sprintId) where.push({ sprintId });
  const parentId = intParam(url, "parent_id");
  if (parentId) where.push({ parentId });
  const assigneeId = url.searchParams.get("assignee_id");
  if (assigneeId) where.push({ assignees: { some: { userId: assigneeId } } });

  const statusRaw = url.searchParams.get("status");
  if (statusRaw) {
    const statuses = statusRaw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const c = canonicalStatus(s);
      if (!c) throw new ApiError(400, "invalid", `Unknown status '${s}'`, "status");
      return c;
    });
    where.push({ status: { in: statuses } });
  }
  if (boolParam(url, "backlog") === true) where.push({ sprintId: null });
  if (boolParam(url, "backlog") === false) where.push({ sprintId: { not: null } });
  if (boolParam(url, "unassigned") === true) where.push({ assignees: { none: {} } });
  if (boolParam(url, "unassigned") === false) where.push({ assignees: { some: {} } });

  const dueBefore = dateParam(url, "due_before");
  if (dueBefore) where.push({ targetDate: { lt: dueBefore } });
  const updatedSince = timestampParam(url, "updated_since");
  if (updatedSince) where.push({ updatedAt: { gte: updatedSince } });

  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const or: Prisma.TaskWhereInput[] = [{ title: { contains: q, mode: "insensitive" } }];
    // Task keys are "<PROJECTKEY>-<id>", so "CRM-142" or "142" finds task 142.
    const keyMatch = q.match(/^(?:([A-Za-z][A-Za-z0-9]*)-)?(\d+)$/);
    if (keyMatch) {
      const id = Number(keyMatch[2]);
      if (Number.isSafeInteger(id) && id <= 2_147_483_647) or.push({ id });
    }
    where.push({ OR: or });
  }

  const filter: Prisma.TaskWhereInput = { AND: where };
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where: filter,
      include: TASK_INCLUDE,
      orderBy: { id: "asc" },
      skip: page.skip,
      take: page.pageSize,
    }),
    prisma.task.count({ where: filter }),
  ]);
  return paginated(rows.map(serializeTask), total, page);
});

export const POST = v1(
  async (req, { user, url }) => {
    const body = await jsonBody(req);
    const attr = await readAttribution(body);
    return NextResponse.json(await createTask(body, user, attr, url.origin), { status: 201 });
  },
  { idempotent: true },
);

export const DELETE = forbidDelete;
