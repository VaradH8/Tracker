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

/** Notification kinds the public POST endpoint is allowed to write.
 *  Anything outside this set (leave_approved, leave_denied, etc.) is
 *  only legitimately written by server-side flows via notifyUser(). */
const PUBLIC_NOTIFICATION_KINDS = new Set([
  "assigned",
  "status_change",
  "mention",
  "blocked",
  "important",
  "overdue",
]);

/** POST — create a notification + an EmailLog twin. The frontend just
 *  passes `recipient` as a first name; the server resolves it.
 *
 *  Restricted to in-app flows: the caller must be writing one of the
 *  user-facing kinds AND addressing a real teammate. Without this,
 *  any signed-in user could spam arbitrary subjects/bodies to anyone. */
export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;

  const body = await req.json().catch(() => ({}));
  const recipientName = String(body.recipient ?? "");
  const kind = String(body.kind ?? "assigned");
  const title = String(body.title ?? "").slice(0, 200);
  const text = String(body.body ?? "").slice(0, 2000);
  const taskId =
    typeof body.taskId === "number" ? body.taskId : null;

  if (!PUBLIC_NOTIFICATION_KINDS.has(kind)) {
    return NextResponse.json(
      { error: "That notification kind isn't writable here." },
      { status: 400 },
    );
  }
  if (!title.trim()) {
    return NextResponse.json({ error: "Title required." }, { status: 400 });
  }

  const target = await userByFirstName(recipientName);
  if (!target) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  }
  // Notifications must be addressed to someone other than the actor.
  // Without this guard a bored user could spam themselves.
  if (target.id === actor.id) {
    return NextResponse.json({ ok: true, skipped: "self" });
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
  // Fire the real SMTP email, matching notifyUser(). Lazy import so the
  // auth bundle doesn't pull nodemailer. Best-effort: SMTP failure never
  // breaks the in-app notification — the EmailLog row is the audit trail.
  const { sendEmail } = await import("@/lib/mailer");
  void sendEmail({ to: target.email, subject: title, body: text });
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
