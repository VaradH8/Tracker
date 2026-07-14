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
  // Lead is a senior tech lead with Coord-level task authority across
  // projects they're on.
  return role === "Admin" || role === "Lead" || role === "Coordinator";
}

export function canManageUsers(role: SessionUser["role"]): boolean {
  return role === "Admin";
}

export function canSeeProjectFinancials(role: SessionUser["role"]): boolean {
  return role !== "Developer";
}

export function canSeeProjectAudit(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Lead" || role === "Coordinator";
}

/** Oversight roles see every task in the projects they can access — they
 *  run the project and need the full board to assign and track work.
 *  Everyone else (Developer, BusinessDeveloper) is scoped to their *own*
 *  tasks: ones assigned to them or that they're the responsible owner of.
 *  See {@link taskAssignmentFilter}. */
export function canSeeAllProjectTasks(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Lead" || role === "Coordinator";
}

/** Prisma `where` fragment matching only the tasks a non-oversight user
 *  is entitled to see: assigned to them, or they're responsible for it
 *  (e.g. a BD who created the task). Combine with a project scope. */
export function taskAssignmentFilter(userId: string) {
  return {
    OR: [
      { assignees: { some: { userId } } },
      { responsibleId: userId },
    ],
  };
}

/** True if this user is allowed to see a specific task, given its
 *  project + responsible owner. Oversight roles see all; others must be
 *  an assignee or the responsible owner. Assumes project access has
 *  already been checked by the caller. */
export async function canSeeTask(
  user: SessionUser,
  task: { id: number; responsibleId: string | null },
): Promise<boolean> {
  if (canSeeAllProjectTasks(user.role)) return true;
  if (task.responsibleId === user.id) return true;
  return isTaskAssignee(user.id, task.id);
}

/** The `completedAt` value to write when a task's status changes from
 *  `prev` to `next`. Stamps the completion time on the first move to Done,
 *  clears it if the task is reopened, and leaves it untouched otherwise.
 *  Returns `undefined` to mean "don't touch this column". */
export function completedAtUpdate(
  prev: string,
  next: string,
): Date | null | undefined {
  if (next === "Done" && prev !== "Done") return new Date();
  if (next !== "Done" && prev === "Done") return null;
  return undefined;
}

export async function visibleProjectIds(
  user: SessionUser,
): Promise<number[] | "all"> {
  // Admin still has the god view — see every project regardless of
  // assignment. Every other role only sees projects they're assigned to
  // (Lead / Coordinator / Developer / BD), with a fallback to projects
  // where they have a task even if no one's added them to the roster yet.
  if (user.role === "Admin") return "all";

  // Coordinators are scoped to the projects they actually coordinate —
  // NOT projects where they merely appear as a worker/assignee. This
  // keeps one coordinator from seeing another coordinator's projects.
  if (user.role === "Coordinator") {
    const coord = await prisma.projectMember.findMany({
      where: { userId: user.id, role: "Coordinator" },
      select: { projectId: true },
    });
    return Array.from(new Set(coord.map((m) => m.projectId)));
  }

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

/** True if the user can manage tasks on this specific project. Either
 *  they're a global Admin/Coordinator, or they hold a per-project
 *  Lead/Coordinator role on this project. Lets a BD who created a
 *  project (auto-Coordinator on it) add tasks even though their global
 *  role doesn't allow task-edit org-wide. */
export async function canManageProjectTasks(
  user: SessionUser,
  projectId: number,
): Promise<boolean> {
  if (canEditTasks(user.role)) return true;
  const row = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId: user.id,
      role: { in: ["Lead", "Coordinator"] },
    },
    select: { userId: true },
  });
  return row !== null;
}

/** True if the user can *create* tasks on this project. A superset of
 *  canManageProjectTasks: in addition to Lead/Coordinator authority, a
 *  BusinessDeveloper who is rostered on the project (e.g. the BD who
 *  created it) may add tasks. They can't manage the team or assign
 *  developers though — that stays with the Lead/Coordinator, who pick
 *  up the task's assignees afterwards. */
export async function canCreateProjectTasks(
  user: SessionUser,
  projectId: number,
): Promise<boolean> {
  if (await canManageProjectTasks(user, projectId)) return true;
  if (user.role !== "BusinessDeveloper") return false;
  const row = await prisma.projectMember.findFirst({
    where: { projectId, userId: user.id },
    select: { userId: true },
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

/** Write a Notification + the matching EmailLog row in one shot, and
 *  fire a real SMTP email if SMTP_* env vars are configured. Mirrors
 *  what POST /api/notifications does, for callers that need to fire a
 *  notification directly from another route (e.g. leave approval /
 *  denial, password reset). SMTP failure never breaks the in-app
 *  notification — the EmailLog row stays as the admin-readable audit
 *  trail either way. */
export async function notifyUser(
  recipientId: string,
  opts: {
    kind: string;
    title: string;
    body: string;
    taskId?: number | null;
    /** Who did the thing — shown as "Assigned by" in the email. */
    actorName?: string | null;
    /** Request origin (e.g. https://tracker.example.com). When present
     *  the email gets an "Open in Tracker" button to /notifications. */
    baseUrl?: string | null;
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
  // Fire-and-forget the SMTP send. Imported lazily so the auth bundle
  // doesn't pull nodemailer for routes that don't need it. The email is
  // the rich version: task details card + CTA when we have them; the
  // in-app notification and EmailLog keep the short title/body.
  const { sendEmail } = await import("./mailer");
  const { renderNotificationEmail, taskEmailDetails } = await import(
    "./email-html"
  );
  const details = opts.taskId
    ? await taskEmailDetails(opts.taskId, opts.actorName)
    : null;
  const subject = details
    ? `${opts.title} — ${details.title.slice(0, 80)}`
    : opts.title;
  void sendEmail({
    to: target.email,
    subject,
    body: opts.body,
    html: renderNotificationEmail({
      heading: opts.title,
      // When the body is just the task title, the card already shows it.
      intro: details && opts.body.trim() === details.title.trim() ? null : opts.body,
      task: details,
      ctaUrl: opts.baseUrl ? `${opts.baseUrl}/notifications` : null,
    }),
  });
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
