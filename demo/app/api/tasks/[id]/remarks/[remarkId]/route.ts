import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEditTasks, requireUser } from "@/lib/server-access";

/** Author can drop their own remark; Coord/Admin can drop any. */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; remarkId: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { remarkId: rStr } = await context.params;
  const remarkId = Number(rStr);
  if (!Number.isFinite(remarkId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const remark = await prisma.remark.findUnique({ where: { id: remarkId } });
  if (!remark) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (remark.authorId !== user.id && !canEditTasks(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.remark.delete({ where: { id: remarkId } });
  return NextResponse.json({ ok: true });
}
