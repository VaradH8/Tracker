import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { WORKING_ROLES } from "@/lib/domain";

// A working week = 5 days at the person's daily capacity.
const WORKING_DAYS = 5;

/**
 * Resource availability for allocation. Availability is driven purely by
 * the WORK ASSIGNED to each person, NOT by what they've logged — so
 * logging hours never changes someone's availability. For each working
 * person (Actionee / SME / Team Lead):
 *   - weekly capacity  = dailyCapacity × 5,
 *   - allocated        = sum of estimated hours on their open (not-Done) tasks,
 *   - free             = capacity − allocated,
 *   - status           = Free / Partial / Full.
 */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const people = await prisma.domainUser.findMany({
    where: { isActive: true, role: { in: WORKING_ROLES } },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    people.map(async (p) => {
      const agg = await prisma.domainTask.aggregate({
        where: { assigneeId: p.id, status: { not: "Done" } },
        _sum: { estimatedHours: true },
        _count: true,
      });
      const capacity = p.dailyCapacity * WORKING_DAYS;
      const allocated = agg._sum.estimatedHours ?? 0;
      const openTasks = agg._count;
      const free = Math.max(0, capacity - allocated);
      const status =
        allocated <= 0 ? "Free" : allocated >= capacity ? "Full" : "Partial";
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        capacity,
        allocated: Math.round(allocated * 100) / 100,
        free: Math.round(free * 100) / 100,
        openTasks,
        status,
      };
    }),
  );

  return NextResponse.json({ resources: rows });
}