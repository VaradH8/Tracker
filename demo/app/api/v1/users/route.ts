import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { boolParam, pageParams, paginated, timestampParam } from "@/lib/api-v1/http";
import { USER_SELECT, serializeUser } from "@/lib/api-v1/serialize";

/** Team members. Service accounts are never listed. */
export const GET = v1(async (_req, { url }) => {
  const page = pageParams(url);
  const active = boolParam(url, "active");
  const updatedSince = timestampParam(url, "updated_since");
  const where: Prisma.UserWhereInput = {
    isServiceAccount: false,
    ...(active !== undefined ? { isActive: active } : {}),
    ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: page.skip,
      take: page.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return paginated(rows.map(serializeUser), total, page);
});
export const DELETE = forbidDelete;
