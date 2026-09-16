import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyUser, requireUser, writeAudit } from "@/lib/server-access";
import { canApproveLeave, leaveApprovalRefusal } from "@/lib/leave-access";
import type { Role } from "@/lib/role";

/** Owner can cancel their own leave. Removing somebody else's needs the
 *  same authority as approving it (lib/leave-access.ts): a Coordinator
 *  can remove a Developer's entry but not a peer Coordinator's. When the
 *  entry is a *pending* request belonging to someone else, that's a
 *  denial — notify the requester. */
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
  const leave = await prisma.leave.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!leave) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const requester = { id: leave.userId, role: leave.user.primaryRole as Role };
  if (leave.userId !== user.id && !canApproveLeave(user, requester)) {
    return NextResponse.json(
      { error: leaveApprovalRefusal(user, requester) },
      { status: 403 },
    );
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
    await writeAudit(user.id, "leave.deny", {
      scope: leave.type,
      after: range,
    });
  }

  return NextResponse.json({ ok: true });
}
