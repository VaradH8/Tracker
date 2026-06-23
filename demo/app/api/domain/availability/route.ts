import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { istDayStart, WORKING_ROLES } from "@/lib/domain";

/**
 * Resource availability for allocation — the thing Admin mainly cares
 * about. For each working person (Actionee + Team Lead) it returns:
 *   - capacity (hours/day),
 *   - hours logged today and over the last 7 days,
 *   - count of open (not-Done) assigned tasks,
 *   - a derived status: Free / Partial / Full.
 */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin"]);
  if (forbidden) return forbidden;

  const today = istDayStart();
  const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const people = await prisma.domainUser.findMany({
    where: { isActive: true, role: { in: WORKING_ROLES } },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    people.map(async (p) => {
      const [todayAgg, weekAgg, openTasks] = await Promise.all([
        prisma.domainWorkLog.aggregate({
          where: { userId: p.id, date: today },
          _sum: { hours: true },
        }),
        prisma.domainWorkLog.aggregate({
          where: { userId: p.id, date: { gte: weekAgo } },
          _sum: { hours: true },
        }),
        prisma.domainTask.count({
          where: { assigneeId: p.id, status: { not: "Done" } },
        }),
      ]);
      const hoursToday = todayAgg._sum.hours ?? 0;
      const hoursWeek = weekAgg._sum.hours ?? 0;
      const capacity = p.dailyCapacity;
      const ratio = capacity > 0 ? hoursToday / capacity : 1;
      const status = hoursToday <= 0 ? "Free" : ratio >= 1 ? "Full" : "Partial";
      const availableToday = Math.max(0, capacity - hoursToday);
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        capacity,
        hoursToday: Math.round(hoursToday * 100) / 100,
        hoursWeek: Math.round(hoursWeek * 100) / 100,
        availableToday: Math.round(availableToday * 100) / 100,
        openTasks,
        status,
      };
    }),
  );

  return NextResponse.json({ resources: rows });
}