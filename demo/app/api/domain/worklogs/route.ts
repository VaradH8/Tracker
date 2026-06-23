import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import {
  withinLogWindow,
  istDayStart,
  logWindowLabel,
  LOG_WINDOW_END_HOUR,
  LOG_WINDOW_START_HOUR,
} from "@/lib/domain";

function serialize(l: {
  id: number;
  hours: number;
  note: string;
  date: Date;
  createdAt: Date;
  user: { id: string; name: string };
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
    project: l.project?.name ?? null,
    projectId: l.project?.id ?? null,
    task: l.task?.title ?? null,
    taskId: l.task?.id ?? null,
    createdAt: l.createdAt.toISOString(),
  };
}

const LOG_INCLUDE = {
  user: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
} as const;

/** Own logs by default; Admin can see everyone's with ?all=true. */
export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const all = new URL(req.url).searchParams.get("all") === "true";

  const where =
    all && user.role === "Admin" ? {} : { userId: user.id };
  const logs = await prisma.domainWorkLog.findMany({
    where,
    include: LOG_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ logs: logs.map(serialize) });
}

/**
 * Log work for *today*. Hard rule: entries are only accepted while the
 * server clock is inside the 08:00–22:00 IST window. This stops people
 * back-filling fake hours after the fact — there's no "log for another
 * day" path at all.
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
      date: istDayStart(),
      hours: Math.round(hours * 100) / 100,
      note,
    },
    include: LOG_INCLUDE,
  });
  return NextResponse.json({ log: serialize(created) }, { status: 201 });
}