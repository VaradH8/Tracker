import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyUser, requireUser, writeAudit } from "@/lib/server-access";
import { canApproveLeave, leaveApprovalRefusal } from "@/lib/leave-access";
import { serializeLeave } from "@/lib/serializers";
import type { Role } from "@/lib/role";

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const list = await prisma.leave.findMany({
    include: { user: true },
    orderBy: { start: "asc" },
  });
  return NextResponse.json({ leaves: list.map(serializeLeave) });
}

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  const body = await req.json().catch(() => ({}));

  // Dates were optional, and an absent one silently became today — so a
  // request submitted with nothing selected still reached an approver,
  // asking them to sign off a day the person never chose. Required now,
  // and refused rather than guessed.
  if (!body.start || !body.end) {
    return NextResponse.json(
      { error: "Pick a start and end date for the leave." },
      { status: 400 },
    );
  }
  const start = new Date(String(body.start));
  const end = new Date(String(body.end));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json(
      { error: "Those dates aren't valid." },
      { status: 400 },
    );
  }
  if (end.getTime() < start.getTime()) {
    return NextResponse.json(
      { error: "Leave can't end before it starts." },
      { status: 400 },
    );
  }

  const type = String(body.type ?? "Vacation");
  const note = typeof body.note === "string" ? body.note : null;

  const leave = await prisma.leave.create({
    data: { userId: user.id, start, end, type, note },
    include: { user: true },
  });

  // Tell the people who can act on it. Nothing notified anyone before, so a
  // request only surfaced if an approver happened to open the page.
  // Requesters are skipped in their own list — approving your own leave is
  // a separate question, and being told about it is noise either way.
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const approvers = await prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: user.id },
      OR: [{ isAdmin: true }, { primaryRole: { in: ["Admin", "Lead"] } }],
    },
    select: { id: true },
  });
  const origin = new URL(req.url).origin;
  await Promise.all(
    approvers.map((a) =>
      notifyUser(a.id, {
        kind: "leave_requested",
        title: `${user.name} requested ${type} leave`,
        body:
          day(start) === day(end)
            ? `${day(start)}`
            : `${day(start)} to ${day(end)}`,
        actorName: user.name,
        baseUrl: origin,
      }),
    ),
  );

  return NextResponse.json({ leave: serializeLeave(leave) });
}

export async function PATCH(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const before = await prisma.leave.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Approval flows up the org: never your own request, never a peer's.
  // A Coordinator decides Developer/BD leave; a Coordinator's own leave
  // goes to a Lead or Admin. See lib/leave-access.ts for the table.
  const requester = { id: before.userId, role: before.user.primaryRole as Role };
  if (!canApproveLeave(actor, requester)) {
    return NextResponse.json(
      { error: leaveApprovalRefusal(actor, requester) },
      { status: 403 },
    );
  }
  const nowApproved = Boolean(body.approved);
  const updated = await prisma.leave.update({
    where: { id },
    data: { approved: nowApproved },
    include: { user: true },
  });

  if (nowApproved && !before.approved && updated.userId !== actor.id) {
    const range =
      updated.start.toISOString().slice(0, 10) ===
      updated.end.toISOString().slice(0, 10)
        ? updated.start.toISOString().slice(0, 10)
        : `${updated.start.toISOString().slice(0, 10)} → ${updated.end.toISOString().slice(0, 10)}`;
    await notifyUser(updated.userId, {
      kind: "leave_approved",
      title: "Leave approved",
      body: `Your ${updated.type} leave for ${range} was approved by ${actor.name.split(" ")[0]}.`,
    });
    await writeAudit(actor.id, "leave.approve", {
      scope: updated.type,
      after: range,
    });
  }

  return NextResponse.json({ leave: serializeLeave(updated) });
}
