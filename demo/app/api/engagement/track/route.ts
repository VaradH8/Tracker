import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canSeeEngagement, requireUser, writeAudit } from "@/lib/server-access";
import { FORECAST_ROLES, parseTrack } from "@/lib/engagement";

/** PATCH { userId, track } — put a developer / lead on the Application
 *  or Plugin track (track: null takes them off). Planners only. */
export async function PATCH(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSeeEngagement(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  const track = body.track === null || body.track === "" ? null : parseTrack(body.track);
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  if (body.track !== null && body.track !== "" && !track) {
    return NextResponse.json(
      { error: "Track must be Application or Plugin." },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, primaryRole: true, track: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (!(FORECAST_ROLES as readonly string[]).includes(target.primaryRole)) {
    return NextResponse.json(
      { error: "Only developers and leads go on a track." },
      { status: 400 },
    );
  }

  await prisma.user.update({ where: { id: userId }, data: { track } });
  await writeAudit(me.id, "user.track", {
    scope: target.name,
    before: target.track ?? "none",
    after: track ?? "none",
  });
  return NextResponse.json({ ok: true, track });
}
