import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canManageUsers,
  requireUser,
  userByFirstName,
} from "@/lib/server-access";
import { serializeNotification } from "@/lib/serializers";

/** GET — current user's notifications, newest first. */
export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const list = await prisma.notification.findMany({
    where: { userId: user.id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({
    notifications: list.map(serializeNotification),
  });
}

/** POST — create a notification + an EmailLog twin. The frontend just
 *  passes `recipient` as a first name; the server resolves it. */
export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;

  const body = await req.json().catch(() => ({}));
  const recipientName = String(body.recipient ?? "");
  const kind = String(body.kind ?? "assigned");
  const title = String(body.title ?? "");
  const text = String(body.body ?? "");
  const taskId =
    typeof body.taskId === "number" ? body.taskId : null;

  const target = await userByFirstName(recipientName);
  if (!target) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  }

  const [notif] = await prisma.$transaction([
    prisma.notification.create({
      data: {
        userId: target.id,
        kind,
        title,
        body: text,
        taskId,
      },
      include: { user: true },
    }),
    prisma.emailLog.create({
      data: {
        recipientId: target.id,
        toEmail: target.email,
        subject: title,
        body: text,
        kind,
        taskId,
      },
    }),
  ]);
  return NextResponse.json({ notification: serializeNotification(notif) });
}

/** PATCH ?action=read-all — mark every unread for the current user as read. */
export async function PATCH(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "read-all") {
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

// Admin-only helper: clear emails (used by Settings → Email log).
export async function DELETE() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.emailLog.deleteMany({});
  return NextResponse.json({ ok: true });
}
