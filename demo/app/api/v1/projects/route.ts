import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { pageParams, paginated, timestampParam } from "@/lib/api-v1/http";
import { PROJECT_INCLUDE, serializeProject } from "@/lib/api-v1/serialize";

export const GET = v1(async (_req, { url }) => {
  const page = pageParams(url);
  const status = url.searchParams.get("status");
  const memberId = url.searchParams.get("member_id");
  const updatedSince = timestampParam(url, "updated_since");
  const where: Prisma.ProjectWhereInput = {
    ...(status ? { status: { equals: status, mode: "insensitive" } } : {}),
    ...(memberId ? { members: { some: { userId: memberId } } } : {}),
    ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: PROJECT_INCLUDE,
      orderBy: { id: "asc" },
      skip: page.skip,
      take: page.pageSize,
    }),
    prisma.project.count({ where }),
  ]);
  return paginated(rows.map(serializeProject), total, page);
});
export const DELETE = forbidDelete;
