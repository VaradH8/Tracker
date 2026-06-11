import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server-access";

/** GET /api/timer/active — the current user's open timer interval, if any.
 *  Used by the client to restore the running-timer indicator after a
 *  reload or a switch between devices. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const open = await prisma.timeEntry.findFirst({
    where: { userId: user.id, endedAt: null, startedAt: { not: null } },
    orderBy: { startedAt: "desc" },
  });

  if (!open) return NextResponse.json({ active: null });
  return NextResponse.json({
    active: {
      entryId: open.id,
      taskId: open.taskId,
      startedAt: open.startedAt!.toISOString(),
    },
  });
}
