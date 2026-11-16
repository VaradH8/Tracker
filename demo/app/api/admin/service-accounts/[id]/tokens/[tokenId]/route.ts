import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageUsers, requireUser, writeAudit } from "@/lib/server-access";

/**
 * Revoke one token (rotation: issue a new one via POST
 * /api/admin/service-accounts, switch the agent over, then revoke the old).
 * The row is kept with revokedAt set, for the audit trail.
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; tokenId: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  if (!canManageUsers(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, tokenId } = await context.params;
  const token = await prisma.apiToken.findUnique({ where: { id: Number(tokenId) || 0 } });
  if (!token || token.userId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!token.revokedAt) {
    await prisma.apiToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
    await writeAudit(actor.id, "api_token.revoke", { after: `${token.name} (${token.prefix}…)` });
  }
  return NextResponse.json({ ok: true });
}
