import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import {
  backdateFloorISO,
  backdateWindowLabel,
  istParts,
  LOG_WINDOW_END_HOUR,
  LOG_WINDOW_START_HOUR,
} from "@/lib/domain";

/**
 * A work-log entry belongs to the person who logged it, and to nobody
 * else.
 *
 * Editing and deleting are both restricted to the author — deliberately
 * including Admins, who could previously delete anyone's. An hours entry
 * is somebody's own account of their day; a supervisor overwriting or
 * removing it changes the record of what that person said they did, which
 * is not a correction but a rewrite. If an entry is wrong, the person who
 * wrote it fixes it.
 *
 * The 08:00–22:00 window governs *creating* entries, keeping logging a
 * daily habit. It is not applied here: correcting yesterday's typo at
 * 23:00 is not the thing that rule exists to prevent, and the date rules
 * below still stop anyone back-dating work into a closed month.
 */

const LOG_INCLUDE = {
  user: { select: { id: true, name: true, role: true } },
  project: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
} as const;

/** Loads the entry and refuses anyone who is not its author. */
async function ownedEntry(id: number, userId: string) {
  const log = await prisma.domainWorkLog.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!log) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (log.userId !== userId) {
    return {
      error: NextResponse.json(
        { error: "Only the person who logged this can change it." },
        { status: 403 },
      ),
    };
  }
  return { log };
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const owned = await ownedEntry(id, user.id);
  if (owned.error) return owned.error;

  await prisma.domainWorkLog.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/** Correct your own entry: the hours, the note, or the day it covers. */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const owned = await ownedEntry(id, user.id);
  if (owned.error) return owned.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.hours !== undefined) {
    const hours = Number(body.hours);
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
    data.hours = Math.round(hours * 100) / 100;
  }

  if (body.note !== undefined) {
    const note = String(body.note).trim();
    if (!note) {
      return NextResponse.json(
        { error: "Add a short note on what you did." },
        { status: 400 },
      );
    }
    data.note = note;
  }

  // Same window as creating: never ahead of today, never before the 1st of
  // this month. Editing must not become a way around the rule that keeps a
  // reported month closed.
  if (body.date !== undefined) {
    const chosen = String(body.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chosen)) {
      return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });
    }
    if (chosen > istParts().dateISO) {
      return NextResponse.json(
        { error: "You can't log work for a future date." },
        { status: 400 },
      );
    }
    const floor = backdateFloorISO();
    if (chosen < floor) {
      return NextResponse.json(
        {
          error: `Work can only be logged ${backdateWindowLabel()} — nothing earlier than ${floor}.`,
        },
        { status: 400 },
      );
    }
    data.date = new Date(chosen + "T00:00:00.000Z");
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.domainWorkLog.update({
    where: { id },
    data,
    include: LOG_INCLUDE,
  });

  return NextResponse.json({
    log: {
      id: updated.id,
      hours: updated.hours,
      note: updated.note,
      date: updated.date.toISOString().slice(0, 10),
      user: updated.user.name,
      userId: updated.user.id,
      userRole: updated.user.role,
      project: updated.project?.name ?? null,
      projectId: updated.project?.id ?? null,
      task: updated.task?.title ?? null,
      taskId: updated.task?.id ?? null,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
