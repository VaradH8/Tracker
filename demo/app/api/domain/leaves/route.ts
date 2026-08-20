import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import type { DomainRole } from "@/lib/domain";
import {
  approverRoles,
  canDecide,
  canMarkAttendance,
  canMarkFor,
  canSeeLeaveOf,
  hoursIssue,
  initialStatus,
  isLeaveKind,
  REQUESTABLE_KINDS,
} from "@/lib/domain-leave";
import { isValidISODate } from "@/lib/domain-workdays";
import { dayToDate } from "@/lib/domain-schedule";

/**
 * Attendance and time off.
 *
 * GET  — the register. Supervisors see everyone they cover; everyone else
 *        sees only their own rows.
 * POST — a supervisor marking someone, or a worker requesting time off.
 *        Which one it is follows from the caller's role, not from a flag
 *        in the request, so a worker cannot mark themselves present by
 *        sending the supervisor's shape.
 */

const MAX_RANGE_DAYS = 366;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function serialize(r: {
  id: number;
  date: Date;
  kind: string;
  hours: number | null;
  note: string | null;
  status: string;
  decidedAt: Date | null;
  decisionNote: string | null;
  user: { id: string; name: string; role: string };
  createdBy: { id: string; name: string };
  decidedBy: { id: string; name: string } | null;
}, me?: { id: string; role: DomainRole }) {
  return {
    id: r.id,
    date: iso(r.date),
    kind: r.kind,
    hours: r.hours,
    note: r.note,
    status: r.status,
    userId: r.user.id,
    userName: r.user.name,
    userRole: r.user.role,
    createdById: r.createdBy.id,
    createdByName: r.createdBy.name,
    decidedByName: r.decidedBy?.name ?? null,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decisionNote: r.decisionNote,
    /**
     * Answered here rather than re-derived in the browser, so the buttons
     * a person sees and the calls the server will accept come from one
     * rule. A row the client thinks is decidable but the server refuses
     * is just a 403 in the face.
     */
    canDecide: me
      ? canDecide(me, {
          userId: r.user.id,
          targetRole: r.user.role as DomainRole,
        })
      : false,
    /** Who a pending row is sitting with — "Admin", "Team Lead"… */
    awaitingRoles:
      r.status === "Pending" ? approverRoles(r.user.role as DomainRole) : [],
  };
}

const INCLUDE = {
  user: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const;

export async function GET(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;

  const q = new URL(req.url).searchParams;
  const from = q.get("from");
  const to = q.get("to");

  const where: Record<string, unknown> = {};
  if (from && isValidISODate(from) && to && isValidISODate(to)) {
    const a = dayToDate(from);
    const b = dayToDate(to);
    where.date = a <= b ? { gte: a, lte: b } : { gte: b, lte: a };
  } else {
    // Default window: this month either way, so the page opens on
    // something rather than the entire history.
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
    where.date = { gte: start, lte: end };
  }

  /**
   * Scope. A supervisor sees the people they cover — plus their own rows,
   * which they can read but not decide. Everyone else sees themselves
   * only: one person's absence is not another's business.
   */
  const rows = await prisma.domainLeave.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: MAX_RANGE_DAYS * 4,
  });

  /**
   * Everything the caller may read — their own days, plus the team they
   * cover. Reading is deliberately wider than deciding: a Lead keeps the
   * Team Leads in their register even though an Admin signs those off.
   */
  const visible = rows.filter((r) =>
    canSeeLeaveOf(me, { id: r.user.id, role: r.user.role as DomainRole }),
  );

  // Who this person may file or mark for, so the form can offer a list
  // rather than let someone type an id and find out.
  const everyone = await prisma.domainUser.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const markableFor = canMarkAttendance(me.role)
    ? everyone.filter((u) => canMarkFor(me.role, u.role as DomainRole))
    : [];

  const serialized = visible.map((r) => serialize(r, me));

  return NextResponse.json({
    leaves: serialized,
    canMark: canMarkAttendance(me.role),
    me: { id: me.id, name: me.name, role: me.role },
    people: markableFor,
    // Only what is actually theirs to action. Counting every pending row
    // they can see put a badge on Leads for Team Lead requests that only
    // an Admin can clear.
    pendingCount: serialized.filter(
      (r) => r.status === "Pending" && r.canDecide,
    ).length,
  });
}

export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;

  const body = await req.json().catch(() => ({}));
  const date = String(body.date ?? "").slice(0, 10);
  const kind = body.kind;

  if (!isValidISODate(date)) {
    return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });
  }
  if (!isLeaveKind(kind)) {
    return NextResponse.json({ error: "Pick present, absent, half day or leave." }, { status: 400 });
  }

  const supervising = canMarkAttendance(me.role);

  /**
   * Whose day this is.
   *
   * A worker may only ever file for themselves — the `userId` in the
   * request is ignored for them rather than rejected, because the only
   * reason to send someone else's is to try it on.
   */
  const targetId = supervising ? String(body.userId ?? me.id) : me.id;

  const target = await prisma.domainUser.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!target || !target.isActive) {
    return NextResponse.json({ error: "No such person." }, { status: 404 });
  }

  if (supervising) {
    // Marking yourself present is self-certification, so a supervisor
    // files for themselves the same way anyone else does — as a request.
    if (target.id !== me.id && !canMarkFor(me.role, target.role as DomainRole)) {
      return NextResponse.json(
        { error: "You can't mark attendance for them." },
        { status: 403 },
      );
    }
  }

  const selfFiling = target.id === me.id;
  if (
    (!supervising || selfFiling) &&
    !REQUESTABLE_KINDS.includes(kind)
  ) {
    return NextResponse.json(
      { error: "You can request a half day or a leave. Attendance is marked by your lead." },
      { status: 403 },
    );
  }

  const issue = hoursIssue(kind, body.hours);
  if (issue) return NextResponse.json({ error: issue }, { status: 400 });

  const hours = kind === "Half day" ? Number(body.hours) : null;
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : null;

  const status = selfFiling ? "Pending" : initialStatus(me.role);

  // One row per person per day: re-marking a day corrects it rather than
  // stacking a second, contradictory record.
  const saved = await prisma.domainLeave.upsert({
    where: { userId_date: { userId: target.id, date: dayToDate(date) } },
    create: {
      userId: target.id,
      date: dayToDate(date),
      kind,
      hours,
      note,
      status,
      createdById: me.id,
      decidedById: status === "Approved" ? me.id : null,
      decidedAt: status === "Approved" ? new Date() : null,
    },
    update: {
      kind,
      hours,
      note,
      status,
      createdById: me.id,
      decidedById: status === "Approved" ? me.id : null,
      decidedAt: status === "Approved" ? new Date() : null,
      decisionNote: null,
    },
    include: INCLUDE,
  });

  return NextResponse.json({ leave: serialize(saved) }, { status: 201 });
}
