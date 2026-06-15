import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth";
import { prisma } from "./db";

export type { SessionUser } from "./auth";

export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export function requireRole(
  user: SessionUser,
  allowed: SessionUser["role"][],
): NextResponse | null {
  if (!allowed.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export function canEditTasks(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Coordinator";
}

export function canManageUsers(role: SessionUser["role"]): boolean {
  return role === "Admin";
}

export function canSeeProjectFinancials(role: SessionUser["role"]): boolean {
  return role !== "Developer";
}

export function canSeeProjectAudit(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Coordinator";
}

export async function visibleProjectIds(
  user: SessionUser,
): Promise<number[] | "all"> {
  // Admin still has the god view — see every project regardless of
  // assignment. Every other role only sees projects they're assigned to
  // (Lead / Coordinator / Developer / BD), with a fallback to projects
  // where they have a task even if no one's added them to the roster yet.
  if (user.role === "Admin") return "all";

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  const fromTasks = await prisma.taskAssignee.findMany({
    where: { userId: user.id },
    select: { task: { select: { projectId: true } } },
  });
  return Array.from(
    new Set([
      ...memberships.map((m) => m.projectId),
      ...fromTasks.map((r) => r.task.projectId),
    ]),
  );
}

export async function canAccessProject(
  user: SessionUser,
  projectId: number,
): Promise<boolean> {
  const ids = await visibleProjectIds(user);
  if (ids === "all") return true;
  return ids.includes(projectId);
}

export async function isTaskAssignee(
  userId: string,
  taskId: number,
): Promise<boolean> {
  const row = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });
  return row !== null;
}

/** Look up a User by first name (case-insensitive). Internal tool: we
 *  assume first names are unique enough; returns the first match. */
export async function userByFirstName(firstName: string) {
  const q = firstName.trim();
  if (!q) return null;
  return prisma.user.findFirst({
    where: {
      OR: [
        { name: { startsWith: q + " ", mode: "insensitive" } },
        { name: { equals: q, mode: "insensitive" } },
      ],
    },
  });
}

/** Write a Notification + the matching EmailLog row in one shot.
 *  Mirrors what POST /api/notifications does, for callers that need
 *  to fire a notification directly from another route (e.g. leave
 *  approval / denial). */
export async function notifyUser(
  recipientId: string,
  opts: {
    kind: string;
    title: string;
    body: string;
    taskId?: number | null;
  },
) {
  const target = await prisma.user.findUnique({ where: { id: recipientId } });
  if (!target) return;
  await prisma.$transaction([
    prisma.notification.create({
      data: {
        userId: target.id,
        kind: opts.kind,
        title: opts.title,
        body: opts.body,
        taskId: opts.taskId ?? null,
      },
    }),
    prisma.emailLog.create({
      data: {
        recipientId: target.id,
        toEmail: target.email,
        subject: opts.title,
        body: opts.body,
        kind: opts.kind,
        taskId: opts.taskId ?? null,
      },
    }),
  ]);
}

export async function writeAudit(
  actorId: string,
  action: string,
  opts: {
    scope?: string;
    taskTitle?: string;
    before?: string;
    after?: string;
  } = {},
) {
  await prisma.auditEntry.create({
    data: {
      actorId,
      action,
      scope: opts.scope,
      taskTitle: opts.taskTitle,
      before: opts.before,
      after: opts.after,
    },
  });
}
