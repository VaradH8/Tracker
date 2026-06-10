import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server-access";
import { serializeAudit } from "@/lib/serializers";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  // Audit log is broadly visible; pages decide whether to surface it
  // (Admin/Coord today). Keeping access open here keeps client code simple.
  const entries = await prisma.auditEntry.findMany({
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ entries: entries.map(serializeAudit) });
}
