import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import {
  ApiError,
  dateParam,
  intParam,
  jsonBody,
  pageParams,
  paginated,
  timestampParam,
} from "@/lib/api-v1/http";
import { SPRINT_INCLUDE, SPRINT_STATUSES, serializeSprint } from "@/lib/api-v1/serialize";
import { createSprint } from "@/lib/api-v1/sprints";
import { readAttribution } from "@/lib/api-v1/tasks";

export const GET = v1(async (_req, { url }) => {
  const page = pageParams(url);
  const projectId = intParam(url, "project_id");
  const status = url.searchParams.get("status")?.toLowerCase();
  if (status && !(SPRINT_STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(400, "invalid", "status must be planned, active or closed", "status");
  }
  const startsAfter = dateParam(url, "starts_after");
  const updatedSince = timestampParam(url, "updated_since");
  const where: Prisma.SprintWhereInput = {
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    ...(startsAfter ? { startDate: { gte: startsAfter } } : {}),
    ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.sprint.findMany({
      where,
      include: SPRINT_INCLUDE,
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      skip: page.skip,
      take: page.pageSize,
    }),
    prisma.sprint.count({ where }),
  ]);
  return paginated(rows.map(serializeSprint), total, page);
});

export const POST = v1(
  async (req, { user }) => {
    const body = await jsonBody(req);
    const attr = await readAttribution(body);
    return NextResponse.json(await createSprint(body, user, attr), { status: 201 });
  },
  { idempotent: true },
);

export const DELETE = forbidDelete;
