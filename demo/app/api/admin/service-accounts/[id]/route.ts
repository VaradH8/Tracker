import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageUsers, requireUser, writeAudit } from "@/lib/server-access";

/**
 * PATCH { active: false } — the kill switch (S-6). Every token for the
 * account stops working on the next request; { active: true } restores it.
 */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  if (!canManageUsers(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Send { active: true|false }" }, { status: 400 });
  }
  const account = await prisma.user.findUnique({ where: { id }, select: { isServiceAccount: true, email: true } });
  if (!account?.isServiceAccount) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.user.update({ where: { id }, data: { isActive: body.active } });
  await writeAudit(actor.id, body.active ? "api_account.enable" : "api_account.disable", { scope: account.email });
  return NextResponse.json({ ok: true, active: body.active });
}
