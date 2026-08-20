import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser } from "@/lib/domain-auth";
import type { DomainRole } from "@/lib/domain";
import {
  canDecide,
  canMarkFor,
  hoursIssue,
  isLeaveKind,
} from "@/lib/domain-leave";

/**
 * Deciding, correcting and withdrawing one attendance row.
 *
 * PATCH  — approve or reject a pending request, or correct a row's kind
 *          and hours.
 * DELETE — withdraw. The person who filed it may take it back while it
 *          is still pending; a supervisor may remove one they cover.
 */

const INCLUDE = {
  user: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const;

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
}) {
  return {
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
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
  };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const row = await prisma.domainLeave.findUnique({
    where: { id },
    include: INCLUDE,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /**
   * Two different permissions, deliberately separated.
   *
   * Keeping the record — correcting a half day logged as four hours that
   * was really two — follows the ordinary supervisory line: a Lead keeps
   * the register for everyone under them.
   *
   * Signing off a *request* follows the routing instead, which sends a
   * Lead's or a Team Lead's own leave to an Admin. Without the split, a
   * Lead who cannot approve their Team Lead also could not fix a typo in
   * that Team Lead's row.
   */
  const supervises =
    row.user.id !== me.id &&
    canMarkFor(me.role, row.user.role as DomainRole);
  if (!supervises) {
    return NextResponse.json(
      { error: "That isn't yours to change." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const mayDecide = canDecide(
      { id: me.id, role: me.role },
      { userId: row.user.id, targetRole: row.user.role as DomainRole },
    );
    if (!mayDecide) {
      return NextResponse.json(
        { error: "That request is for an admin to decide." },
        { status: 403 },
      );
    }
    if (body.status !== "Approved" && body.status !== "Rejected") {
      return NextResponse.json(
        { error: "A decision is either Approved or Rejected." },
        { status: 400 },
      );
    }
    data.status = body.status;
    data.decidedById = me.id;
    data.decidedAt = new Date();
    data.decisionNote =
      typeof body.decisionNote === "string" && body.decisionNote.trim()
        ? body.decisionNote.trim().slice(0, 500)
        : null;
  }

  // Correcting the record itself — a half day logged as 4 hours that was
  // really 2, or a leave that should have been an absence.
  if (body.kind !== undefined) {
    if (!isLeaveKind(body.kind)) {
      return NextResponse.json({ error: "Unknown kind." }, { status: 400 });
    }
    const issue = hoursIssue(body.kind, body.hours);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    data.kind = body.kind;
    data.hours = body.kind === "Half day" ? Number(body.hours) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const saved = await prisma.domainLeave.update({
    where: { id },
    data,
    include: INCLUDE,
  });
  return NextResponse.json({ leave: serialize(saved) });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const row = await prisma.domainLeave.findUnique({
    where: { id },
    include: INCLUDE,
  });
  if (!row) return NextResponse.json({ ok: true });

  /**
   * Admin only.
   *
   * The register is the record of who was where, and it is read back
   * months later to settle questions about a delivery date or a
   * timesheet. A record anybody in the chain can erase is not a record —
   * a Team Lead could delete the absence they marked, and a worker could
   * delete a rejected request and file a fresh one as though the first
   * had never happened.
   *
   * Nobody is trapped by this. Filing again for the same day overwrites
   * that day rather than stacking a second row (see the POST upsert), so
   * a wrong entry is corrected by re-entering it. Deletion is only for
   * the case correction cannot reach: a row on a day that should have no
   * row at all.
   */
  if (me.role !== "Admin") {
    return NextResponse.json(
      { error: "Only an admin can delete from the register." },
      { status: 403 },
    );
  }

  await prisma.domainLeave.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
