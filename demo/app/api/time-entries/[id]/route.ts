import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEditTasks, requireUser } from "@/lib/server-access";

/** Owner can delete their own time log; Coord/Admin can delete any.
 *  Also rolls the hours back off the task's actualHours. */
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
  const entry = await prisma.timeEntry.findUnique({
    where: { id },
    include: { task: { select: { id: true, actualHours: true } } },
  });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (entry.userId !== user.id && !canEditTasks(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.timeEntry.delete({ where: { id } }),
    prisma.task.update({
      where: { id: entry.taskId },
      data: {
        actualHours: Math.max(0, (entry.task.actualHours ?? 0) - entry.hours),
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
