import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canSeeProjectAudit, requireUser } from "@/lib/server-access";
import { serializeAudit } from "@/lib/serializers";

/** Admin / Coordinator only — the audit log includes every actor's
 *  actions across the org and is not safe to expose to developers or
 *  BDs. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canSeeProjectAudit(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const entries = await prisma.auditEntry.findMany({
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ entries: entries.map(serializeAudit) });
}
