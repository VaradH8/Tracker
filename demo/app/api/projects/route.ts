import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, visibleProjectIds } from "@/lib/server-access";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const ids = await visibleProjectIds(user);
  const projects = await prisma.project.findMany({
    where: ids === "all" ? undefined : { id: { in: ids } },
    include: {
      client: true,
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(projects);
}
