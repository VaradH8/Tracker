import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEditTasks, notifyUser, requireUser } from "@/lib/server-access";

/** Owner can cancel their own leave; Coord/Admin can delete any.
 *  When a coord/admin deletes a *pending* request belonging to someone
 *  else, that's a denial — notify the requester. */
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

  const isDenial = leave.userId !== user.id && !leave.approved;

  await prisma.leave.delete({ where: { id } });

  if (isDenial) {
    const range =
      leave.start.toISOString().slice(0, 10) ===
      leave.end.toISOString().slice(0, 10)
        ? leave.start.toISOString().slice(0, 10)
        : `${leave.start.toISOString().slice(0, 10)} → ${leave.end.toISOString().slice(0, 10)}`;
    await notifyUser(leave.userId, {
      kind: "leave_denied",
      title: "Leave denied",
      body: `Your ${leave.type} leave request for ${range} was denied by ${user.name.split(" ")[0]}.`,
    });
  }

  return NextResponse.json({ ok: true });
}
