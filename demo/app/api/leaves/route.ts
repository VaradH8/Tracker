import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canEditTasks, notifyUser, requireUser } from "@/lib/server-access";
import { serializeLeave } from "@/lib/serializers";

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
  const start = body.start ? new Date(String(body.start)) : new Date();
  const end = body.end ? new Date(String(body.end)) : start;
  const type = String(body.type ?? "Vacation");
  const note = typeof body.note === "string" ? body.note : null;

  const leave = await prisma.leave.create({
    data: { userId: user.id, start, end, type, note },
    include: { user: true },
  });
  return NextResponse.json({ leave: serializeLeave(leave) });
}

export async function PATCH(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  if (!canEditTasks(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const before = await prisma.leave.findUnique({ where: { id } });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
  }

  return NextResponse.json({ leave: serializeLeave(updated) });
}
