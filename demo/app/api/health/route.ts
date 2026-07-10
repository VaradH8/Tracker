import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Liveness + readiness probe for uptime monitors and the container
 * healthcheck. Unauthenticated on purpose — it exposes nothing beyond
 * up/down and reachability of Postgres.
 *
 *   200 {status:"ok"}       — app is up and the DB answered.
 *   503 {status:"degraded"} — app is up but the DB query failed.
 *
 * Point UptimeRobot / BetterStack (and, optionally, a compose
 * healthcheck) at GET /api/health. Keep the DB check cheap (`SELECT 1`)
 * so frequent polling costs nothing.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", time: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", error: "database unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
