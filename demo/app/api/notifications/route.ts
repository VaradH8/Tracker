import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canManageUsers,
  requireUser,
  userByFirstName,
} from "@/lib/server-access";
import { rateLimit } from "@/lib/rate-limit";
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
 *  Every legitimate call is tied to a task the actor is working on
 *  (assignment, reassignment, mention, block, status change). We require
 *  and verify that binding here:
 *    - `taskId` must reference a real task,
 *    - the actor must have access to that task's project.
 *  This stops a signed-in user from firing an out-of-context email (with
 *  attacker-chosen subject/body and a real company From address) at an
 *  arbitrary colleague — the classic phishing/spam vector. A per-actor
 *  rate limit blunts bulk abuse and keeps a runaway client from burning
 *  the SMTP daily quota, which would silently drop everyone's mail.
 *
 *  Residual: within a project they legitimately belong to, an actor can
 *  still author the body — acceptable for an internal tool, and every
 *  send is captured in EmailLog for audit. */
const NOTIFY_MAX_PER_WINDOW = 30;
const NOTIFY_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;

  const gate = rateLimit(
    `notify:${actor.id}`,
    NOTIFY_MAX_PER_WINDOW,
    NOTIFY_WINDOW_MS,
  );
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many notifications. Slow down and try again shortly." },
      { status: 429 },
    );
  }

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

  // Bind the notification to a task the actor can actually see. This is
  // the control that turns "email anyone anything" into "notify about a
  // task you work on".
  if (taskId === null) {
    return NextResponse.json(
      { error: "A notification must reference a task." },
      { status: 400 },
    );
  }
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  if (!(await canAccessProject(actor, task.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
