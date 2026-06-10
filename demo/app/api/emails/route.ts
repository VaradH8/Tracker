import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageUsers, requireUser } from "@/lib/server-access";
import { serializeEmail } from "@/lib/serializers";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const list = await prisma.emailLog.findMany({
    include: { recipient: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ emails: list.map(serializeEmail) });
}

export async function DELETE() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.emailLog.deleteMany({});
  return NextResponse.json({ ok: true });
}
