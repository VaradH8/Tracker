import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canSeeEngagement, requireUser, writeAudit } from "@/lib/server-access";
import { FORECAST_ROLES, parseTrack } from "@/lib/engagement";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseIds(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** PUT — save (or overwrite) the forecast for one project + track.
 *
 *  What-if only: nothing is assigned. The listed people are reserved so
 *  other projects' forecasts don't count them too — a person can sit in
 *  one forecast at a time (release them from the other one first). */
export async function PUT(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSeeEngagement(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = Number(body.projectId);
  const track = parseTrack(body.track);
  const startDate = String(body.startDate ?? "");
  const targetDate =
    body.targetDate === null || body.targetDate === "" || body.targetDate === undefined
      ? null
      : String(body.targetDate);
  const effortHours = Number(body.effortHours);
  const memberIds: string[] = Array.isArray(body.memberIds)
    ? Array.from(new Set(body.memberIds.filter((x: unknown) => typeof x === "string")))
    : [];

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "Pick a project." }, { status: 400 });
  }
  if (!track) {
    return NextResponse.json({ error: "Pick Application or Plugin." }, { status: 400 });
  }
  if (!ISO_DAY.test(startDate)) {
    return NextResponse.json({ error: "Start date is required." }, { status: 400 });
  }
  if (targetDate !== null && (!ISO_DAY.test(targetDate) || targetDate < startDate)) {
    return NextResponse.json(
      { error: "Target date must be on or after the start date." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(effortHours) || effortHours < 0) {
    return NextResponse.json({ error: "Effort must be 0 or more hours." }, { status: 400 });
  }
  if (memberIds.length === 0) {
    return NextResponse.json({ error: "Tick at least one person." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Only active doers can be reserved.
  const valid = await prisma.user.findMany({
    where: {
      id: { in: memberIds },
      isActive: true,
      primaryRole: { in: [...FORECAST_ROLES] },
    },
    select: { id: true },
  });
  if (valid.length !== memberIds.length) {
    return NextResponse.json(
      { error: "Some of the ticked people can't be forecast." },
      { status: 400 },
    );
  }

  // One forecast per person at a time. Forecasts for Delivered projects
  // are finished and no longer hold anyone.
  const others = await prisma.resourceForecast.findMany({
    where: {
      NOT: { projectId, track },
      project: { status: { not: "Delivered" } },
    },
    select: { memberIds: true },
  });
  const taken = new Set(others.flatMap((f) => parseIds(f.memberIds)));
  if (memberIds.some((id) => taken.has(id))) {
    return NextResponse.json(
      { error: "Someone you ticked is already reserved in another forecast." },
      { status: 409 },
    );
  }

  const data = {
    startDate: new Date(startDate + "T00:00:00Z"),
    targetDate: targetDate ? new Date(targetDate + "T00:00:00Z") : null,
    effortHours,
    memberIds: JSON.stringify(memberIds),
  };
  await prisma.resourceForecast.upsert({
    where: { projectId_track: { projectId, track } },
    create: { projectId, track, createdById: me.id, ...data },
    update: data,
  });
  await writeAudit(me.id, "forecast.saved", {
    scope: `${project.name} · ${track}`,
    after: `${memberIds.length} people, ${effortHours}h, ${startDate} → ${targetDate ?? "no target"}`,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE ?projectId=&track= — clear a forecast (releases its people).
 *  With &userId= it releases just that one person instead. */
export async function DELETE(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canSeeEngagement(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get("projectId"));
  const track = parseTrack(url.searchParams.get("track"));
  const userId = url.searchParams.get("userId");
  if (!Number.isInteger(projectId) || projectId <= 0 || !track) {
    return NextResponse.json({ error: "projectId and track are required." }, { status: 400 });
  }

  const row = await prisma.resourceForecast.findUnique({
    where: { projectId_track: { projectId, track } },
    include: { project: { select: { name: true } } },
  });
  if (!row) return NextResponse.json({ ok: true });

  const remaining = userId ? parseIds(row.memberIds).filter((id) => id !== userId) : [];
  if (remaining.length > 0) {
    await prisma.resourceForecast.update({
      where: { id: row.id },
      data: { memberIds: JSON.stringify(remaining) },
    });
  } else {
    await prisma.resourceForecast.delete({ where: { id: row.id } });
  }
  await writeAudit(me.id, userId ? "forecast.released" : "forecast.cleared", {
    scope: `${row.project.name} · ${track}`,
  });
  return NextResponse.json({ ok: true });
}
