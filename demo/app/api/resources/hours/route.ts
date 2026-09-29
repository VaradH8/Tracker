import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canSeeTeamHours, requireUser } from "@/lib/server-access";

/** How far back to send. The page shows "last 5 working days" and "last
 *  30 days", windowed client-side in the viewer's timezone; a day of
 *  slack keeps the 30-day edge whole across UTC offsets. */
const LOOKBACK_DAYS = 31;

/** GET — hours logged per person per day, for everyone.
 *
 *  /api/time-entries is scoped to the viewer's projects, so on Resources
 *  a Lead or Coordinator saw 0h for anyone working elsewhere. This hands
 *  oversight roles the totals only — user, day, hours — and nothing that
 *  identifies which task or project the time went to. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canSeeTeamHours(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);

  const rows = await prisma.timeEntry.groupBy({
    by: ["userId", "date"],
    where: { date: { gte: since } },
    _sum: { hours: true },
  });

  return NextResponse.json({
    days: rows.map((r) => ({
      userId: r.userId,
      date: r.date.toISOString().slice(0, 10),
      hours: r._sum.hours ?? 0,
    })),
  });
}
