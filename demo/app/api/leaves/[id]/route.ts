import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEditTasks, requireUser } from "@/lib/server-access";

/** Owner can cancel their own leave; Coord/Admin can delete any. */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const leave = await prisma.leave.findUnique({ where: { id } });
  if (!leave) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (leave.userId !== user.id && !canEditTasks(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.leave.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
