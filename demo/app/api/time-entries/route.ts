import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, visibleProjectIds } from "@/lib/server-access";
import { serializeTimeEntry } from "@/lib/serializers";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const ids = await visibleProjectIds(user);
  const entries = await prisma.timeEntry.findMany({
    where: ids === "all" ? undefined : { task: { projectId: { in: ids } } },
    include: { user: true },
    orderBy: { date: "desc" },
    take: 1000,
  });
  return NextResponse.json({ entries: entries.map(serializeTimeEntry) });
}
