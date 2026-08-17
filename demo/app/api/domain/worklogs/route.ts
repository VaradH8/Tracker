import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import {
  withinLogWindow,
  istDayStart,
  istParts,
  logWindowLabel,
  worklogVisibleRoles,
  backdateFloorISO,
  backdateWindowLabel,
  LOG_WINDOW_END_HOUR,
  LOG_WINDOW_START_HOUR,
} from "@/lib/domain";

function serialize(l: {
  id: number;
  hours: number;
  note: string;
  date: Date;
  createdAt: Date;
  user: { id: string; name: string; role: string };
  project: { id: number; name: string } | null;
  task: { id: number; title: string } | null;
}) {
  return {
    id: l.id,
    hours: l.hours,
    note: l.note,
    date: l.date.toISOString().slice(0, 10),
    user: l.user.name,
    userId: l.user.id,
    userRole: l.user.role,
    project: l.project?.name ?? null,
    projectId: l.project?.id ?? null,
    task: l.task?.title ?? null,
    taskId: l.task?.id ?? null,
    createdAt: l.createdAt.toISOString(),
  };
}

const LOG_INCLUDE = {
  user: { select: { id: true, name: true, role: true } },
  project: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
} as const;

/**
 * Own logs by default. `?all=true` widens it to the people this viewer
 * oversees, plus themselves:
 *   Admin — everyone, Leads included.
 *   Lead  — the people who do the work (Team Leads, SMEs, Actionees). A
 *           Lead doesn't get to read another Lead's log.
 *   Anyone else — ignored; they still see only their own.
 *
 * Narrow further with ?userId=, ?from= and ?to= (inclusive ISO dates).
 */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const params = new URL(req.url).searchParams;
  const all = params.get("all") === "true";
  const userId = params.get("userId");
  const from = params.get("from");
  const to = params.get("to");

  // Who this viewer is allowed to read at all — see worklogVisibleRoles.
  const visible = worklogVisibleRoles(user.role);

  let scope: Record<string, unknown>;
  if (!all || visible.length === 0) {
    scope = { userId: user.id };
  } else {
    /**
     * The roles they oversee, plus themselves.
     *
     * Their own entries used to be excluded here, because they had a home
     * of their own under "My log". That tab is gone, so excluding them
     * would leave a person's own hours visible nowhere at all — and with
     * editing restricted to the author, the one row you are allowed to
     * correct would be the one row you could never see.
     */
    scope = {
      OR: [{ user: { role: { in: visible } } }, { userId: user.id }],
    };
  }

  // An explicit person narrows the scope; it can't widen it, so a Lead
  // asking for another Lead by id still gets nothing.
  if (userId) {
    scope = { AND: [scope, { userId }] };
  }

  const dateRange: Record<string, Date> = {};
  if (from) dateRange.gte = new Date(from + "T00:00:00.000Z");
  if (to) dateRange.lte = new Date(to + "T00:00:00.000Z");

  const logs = await prisma.domainWorkLog.findMany({
    where: {
      ...scope,
      ...(Object.keys(dateRange).length > 0 ? { date: dateRange } : {}),
    },
    include: LOG_INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return NextResponse.json({ logs: logs.map(serialize) });
}

/**
 * Log work. Entries are only accepted while the server clock is inside the
 * 08:00–22:00 IST window, which keeps logging a daily habit rather than a
 * month-end exercise.
 *
 * A date may be given, but only within the last MAX_BACKDATE_DAYS and
 * never in the future. The original rule allowed no date at all; a bounded
 * window lets someone who was on site or off sick catch up, while still
 * making retrospective bulk entry impossible. `createdAt` is untouched, so
 * a log written after the day it covers stays visible as such.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  if (!withinLogWindow()) {
    return NextResponse.json(
      {
        error: `Work can only be logged between ${logWindowLabel()}. It's outside that window now, so this entry can't be saved.`,
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const hours = Number(body.hours);
  const note = String(body.note ?? "").trim();
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: "Enter the hours worked." }, { status: 400 });
  }
  const windowHours = LOG_WINDOW_END_HOUR - LOG_WINDOW_START_HOUR; // 14
  if (hours > windowHours) {
    return NextResponse.json(
      { error: `That's more than a full day (max ${windowHours}h).` },
      { status: 400 },
    );
  }
  if (!note) {
    return NextResponse.json({ error: "Add a short note on what you did." }, { status: 400 });
  }

  // Which day the work happened. Defaults to today; anything else has to
  // fall inside the back-dating window, and never ahead of today.
  let date = istDayStart();
  if (body.date != null && body.date !== "") {
    const chosen = String(body.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chosen)) {
      return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });
    }
    const todayISO = istParts().dateISO;
    if (chosen > todayISO) {
      return NextResponse.json(
        { error: "You can't log work for a future date." },
        { status: 400 },
      );
    }
    const floor = backdateFloorISO();
    if (chosen < floor) {
      return NextResponse.json(
        {
          error: `Work can only be logged ${backdateWindowLabel()} — nothing earlier than ${floor}. Ask a Lead if an entry from a previous month is genuinely missing.`,
        },
        { status: 400 },
      );
    }
    date = new Date(chosen + "T00:00:00.000Z");
  }

  // Which project was this work for? Optional, but the main thing people
  // pick. A linked task's project takes precedence if both are given.
  let projectId: number | null = null;
  if (body.projectId != null && body.projectId !== "") {
    const p = await prisma.domainProject.findUnique({
      where: { id: Number(body.projectId) },
      select: { id: true },
    });
    if (!p) return NextResponse.json({ error: "Project not found." }, { status: 400 });
    projectId = p.id;
  }

  // Optional task link.
  let taskId: number | null = null;
  if (body.taskId != null && body.taskId !== "") {
    const t = await prisma.domainTask.findUnique({
      where: { id: Number(body.taskId) },
      select: { id: true, projectId: true },
    });
    if (!t) return NextResponse.json({ error: "Task not found." }, { status: 400 });
    taskId = t.id;
    if (projectId == null) projectId = t.projectId;
  }

  const created = await prisma.domainWorkLog.create({
    data: {
      userId: user.id,
      projectId,
      taskId,
      date,
      hours: Math.round(hours * 100) / 100,
      note,
    },
    include: LOG_INCLUDE,
  });
  return NextResponse.json({ log: serialize(created) }, { status: 201 });
}