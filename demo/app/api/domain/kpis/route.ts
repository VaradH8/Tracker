import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { WORKING_ROLES, istParts } from "@/lib/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Per-person KPIs for the admin dashboard: completed tasks, logged
 * hours, and open/overdue load for every working person (Team Lead /
 * SME / Actionee), plus a 6-week team hours trend.
 *
 * "Completed (30d)" uses updatedAt on Done tasks as the completion
 * moment — DomainTask has no completedAt column, and the last touch on
 * a Done task is when it was moved there. Good enough for a trend; not
 * an audit trail.
 */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin"]);
  if (forbidden) return forbidden;

  const people = await prisma.domainUser.findMany({
    where: { isActive: true, role: { in: WORKING_ROLES } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, dailyCapacity: true },
  });
  const ids = people.map((p) => p.id);

  const now = new Date();
  const cut30 = new Date(now.getTime() - 30 * DAY_MS);
  const cut7 = new Date(now.getTime() - 7 * DAY_MS);

  // Monday of the current IST week, then five more Mondays back — the
  // buckets for the weekly trend. Work-log dates are stored as midnight
  // UTC of the IST day, so day arithmetic on UTC midnights is exact.
  const today = new Date(istParts(now).dateISO + "T00:00:00.000Z");
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const thisMonday = new Date(today.getTime() - mondayOffset * DAY_MS);
  const weekStarts = Array.from(
    { length: 6 },
    (_, i) => new Date(thisMonday.getTime() - (5 - i) * 7 * DAY_MS),
  );

  const [tasks, logs] = await Promise.all([
    prisma.domainTask.findMany({
      where: { assigneeId: { in: ids } },
      select: {
        assigneeId: true,
        status: true,
        targetDate: true,
        estimatedHours: true,
        updatedAt: true,
      },
    }),
    prisma.domainWorkLog.findMany({
      where: { userId: { in: ids }, date: { gte: weekStarts[0] } },
      select: { userId: true, date: true, hours: true },
    }),
  ]);

  const rows = people.map((p) => {
    const mine = tasks.filter((t) => t.assigneeId === p.id);
    const open = mine.filter((t) => t.status !== "Done");
    const done30 = mine.filter(
      (t) => t.status === "Done" && t.updatedAt >= cut30,
    ).length;
    const overdue = open.filter(
      (t) => t.targetDate !== null && t.targetDate < now,
    ).length;
    const myLogs = logs.filter((l) => l.userId === p.id);
    const sum = (list: { hours: number }[]) =>
      Math.round(list.reduce((a, l) => a + l.hours, 0) * 100) / 100;
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      done30,
      inProgress: open.filter((t) => t.status === "In Progress").length,
      todo: open.filter((t) => t.status === "To Do").length,
      overdue,
      openEstHours:
        Math.round(open.reduce((a, t) => a + (t.estimatedHours ?? 0), 0) * 100) /
        100,
      hours7: sum(myLogs.filter((l) => l.date >= cut7)),
      hours30: sum(myLogs.filter((l) => l.date >= cut30)),
    };
  });

  const weeks = weekStarts.map((start) => {
    const end = new Date(start.getTime() + 7 * DAY_MS);
    const hours = logs
      .filter((l) => l.date >= start && l.date < end)
      .reduce((a, l) => a + l.hours, 0);
    return {
      label: start.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      hours: Math.round(hours * 100) / 100,
    };
  });

  const totals = {
    members: rows.length,
    done30: rows.reduce((a, r) => a + r.done30, 0),
    overdue: rows.reduce((a, r) => a + r.overdue, 0),
    hours7: Math.round(rows.reduce((a, r) => a + r.hours7, 0) * 100) / 100,
  };

  return NextResponse.json({ users: rows, weeks, totals });
}
