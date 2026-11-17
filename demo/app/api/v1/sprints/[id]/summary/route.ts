import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { notFound, routeId } from "@/lib/api-v1/http";
import { STATUSES } from "@/lib/api-v1/serialize";

/** Planned vs done for one sprint. */
export const GET = v1<{ id: string }>(async (_req, { params }) => {
  const id = routeId(params.id);
  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: { tasks: { select: { status: true, estimatedHours: true } } },
  });
  if (!sprint) throw notFound("Sprint");
  const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let plannedHours = 0;
  let doneHours = 0;
  let done = 0;
  let cancelled = 0;
  for (const t of sprint.tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    // Dropped work leaves the plan: it is neither planned nor done.
    if (t.status === "Cancelled") {
      cancelled += 1;
      continue;
    }
    plannedHours += t.estimatedHours ?? 0;
    if (t.status === "Done") {
      done += 1;
      doneHours += t.estimatedHours ?? 0;
    }
  }
  return NextResponse.json({
    sprint_id: sprint.id,
    status: sprint.status,
    planned_tasks: sprint.tasks.length - cancelled,
    done_tasks: done,
    cancelled_tasks: cancelled,
    planned_hours: Math.round(plannedHours * 100) / 100,
    done_hours: Math.round(doneHours * 100) / 100,
    by_status: byStatus,
  });
});
export const DELETE = forbidDelete;
