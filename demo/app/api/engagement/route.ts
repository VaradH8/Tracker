import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canSeeEngagement, requireUser } from "@/lib/server-access";
import { getSettingsParsed } from "@/lib/settings";
import { shortName } from "@/lib/short-name";
import {
  addDays,
  buildEngagementBlocks,
  countWorkingDays,
  ENGAGEMENT_ROLES,
  ENGAGING_PROJECT_STATUSES,
  parseTrack,
  toISO,
  workingDaySet,
} from "@/lib/engagement";

/** Utilization window: hours logged over the last 30 days. */
const RECENT_DAYS = 30;

function day(d: Date | null): string | null {
  return d ? toISO(d) : null;
}

function parseIds(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** GET — everything the Engagement page needs, org-wide.
 *
 *  Oversight roles only. Unlike /api/projects this isn't scoped to the
 *  viewer's projects: planning who is free needs everyone's load. It
 *  shares project names and date spans, never task titles or notes. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canSeeEngagement(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = toISO(new Date());
  const since30 = new Date(addDays(today, -RECENT_DAYS) + "T00:00:00Z");

  const [settings, users, openTasks, hours, leaves, projects, forecasts] =
    await Promise.all([
      getSettingsParsed(),
      prisma.user.findMany({
        where: { isActive: true, primaryRole: { in: [...ENGAGEMENT_ROLES] } },
        orderBy: { name: "asc" },
      }),
      prisma.task.findMany({
        where: {
          status: { not: "Done" },
          project: { status: { in: [...ENGAGING_PROJECT_STATUSES] } },
        },
        select: {
          projectId: true,
          startDate: true,
          targetDate: true,
          createdAt: true,
          estimatedHours: true,
          project: { select: { name: true } },
          assignees: { select: { userId: true } },
        },
      }),
      prisma.timeEntry.groupBy({
        by: ["userId"],
        where: { date: { gte: since30 } },
        _sum: { hours: true },
      }),
      prisma.leave.findMany({
        where: { approved: true, end: { gte: since30 } },
        select: { userId: true, start: true, end: true, type: true },
      }),
      prisma.project.findMany({
        where: { status: { not: "Delivered" } },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          targetDate: true,
          budgetHours: true,
          loggedHours: true,
          client: { select: { name: true } },
          tasks: {
            where: { status: { not: "Done" } },
            select: { estimatedHours: true },
          },
        },
        orderBy: { startDate: "desc" },
      }),
      prisma.resourceForecast.findMany({
        include: { project: { select: { name: true, status: true } } },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  const workDays = workingDaySet(settings.workingDays);
  const daysPerWeek = Math.max(1, settings.workingDays.length || 5);
  const people = users.map((u) => ({
    id: u.id,
    name: u.name,
    shortName: shortName(u.name),
    role: u.primaryRole,
    designation: u.designation ?? "",
    track: parseTrack(u.track),
    hoursPerDay:
      Math.round(((u.capacityPerWeek || 40) / daysPerWeek) * 10) / 10,
  }));
  const peopleIds = new Set(people.map((p) => p.id));

  const blocks = buildEngagementBlocks(
    openTasks.map((t) => ({
      projectId: t.projectId,
      projectName: t.project.name,
      startDate: day(t.startDate),
      targetDate: day(t.targetDate),
      createdAt: toISO(t.createdAt),
      estimatedHours: t.estimatedHours,
      assigneeIds: t.assignees.map((a) => a.userId),
    })),
    today,
  ).filter((b) => peopleIds.has(b.userId));

  // Per-person workload: open work, overdue, and how much of their
  // working capacity they logged over the last 30 days.
  const hoursBy = new Map(hours.map((h) => [h.userId, h._sum.hours ?? 0]));
  const workDays30 = countWorkingDays(addDays(today, -RECENT_DAYS + 1), today, workDays);
  const workload: Record<
    string,
    {
      utilization30: number;
      openTasks: number;
      overdueTasks: number;
      remainingHours: number;
      projects: number;
    }
  > = {};
  for (const p of people) {
    const mine = blocks.filter((b) => b.userId === p.id);
    const capacity = p.hoursPerDay * workDays30;
    workload[p.id] = {
      utilization30:
        capacity > 0 ? Math.round(((hoursBy.get(p.id) ?? 0) / capacity) * 100) : 0,
      openTasks: mine.reduce((s, b) => s + b.openTasks, 0),
      overdueTasks: mine.reduce((s, b) => s + b.overdueTasks, 0),
      remainingHours:
        Math.round(mine.reduce((s, b) => s + b.remainingHours, 0) * 10) / 10,
      projects: mine.length,
    };
  }

  return NextResponse.json({
    today,
    workingDays: settings.workingDays,
    hoursPerDay: settings.workingHoursPerDay,
    people,
    blocks,
    leaves: leaves
      .filter((l) => peopleIds.has(l.userId))
      .map((l) => ({
        userId: l.userId,
        start: toISO(l.start),
        end: toISO(l.end),
        type: l.type,
      })),
    workload,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client.name,
      status: p.status,
      startDate: toISO(p.startDate),
      targetDate: toISO(p.targetDate),
      budgetHours: p.budgetHours,
      loggedHours: p.loggedHours,
      openEstimateHours:
        Math.round(p.tasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0) * 10) / 10,
    })),
    forecasts: forecasts.map((f) => ({
      projectId: f.projectId,
      projectName: f.project.name,
      // A Delivered project's forecast is history: listed under
      // "Completed" and no longer reserves anyone.
      completed: f.project.status === "Delivered",
      track: parseTrack(f.track) ?? "Application",
      startDate: toISO(f.startDate),
      targetDate: day(f.targetDate),
      effortHours: f.effortHours,
      memberIds: parseIds(f.memberIds).filter((id) => peopleIds.has(id)),
      updatedAt: f.updatedAt.toISOString(),
    })),
  });
}
