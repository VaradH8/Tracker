import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth";
import { prisma } from "./db";
import { refreshShortNames } from "./server-names";

export type { SessionUser } from "./auth";

export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Every route serializes people by shortName(); make sure it knows who
  // shares a first name before any of that happens.
  await refreshShortNames();
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

/** Per-person hour *totals* on Resources. Oversight roles see every
 *  person's totals — otherwise anyone working outside the viewer's own
 *  projects reads as 0h, because time entries are project-scoped (see
 *  {@link visibleProjectIds}). Only totals are shared: no task, project
 *  or note leaves the server through this. */
export function canSeeTeamHours(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Lead" || role === "Coordinator";
}

/** Resource Engagement & Project Forecast (/engagement): who is on what
 *  across every project, who is free, and what-if staffing for upcoming
 *  work. A planning tool, so it stays with the oversight roles — the same
 *  ones that see team hours. Mirrored client-side in lib/access.ts. */
export function canSeeEngagement(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Lead" || role === "Coordinator";
}

/** "Reporting Manager" is a role, not a per-person assignment: every
 *  active Admin and Lead is a Reporting Manager for everyone. They rate
 *  and comment on every review (canEditPerformance) and all receive the
 *  comments an employee sends to "Reporting Manager". */
export const REPORTING_MANAGER_ROLES = ["Admin", "Lead"] as const;

/** Prisma `where` for the active Reporting Managers (Admins and Leads). */
export const reportingManagersWhere = {
  isActive: true,
  OR: [{ primaryRole: { in: [...REPORTING_MANAGER_ROLES] } }, { isAdmin: true }],
};

export function isReportingManager(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Lead";
}

/** Performance reviews (/performance): view the generated Monthly /
 *  Yearly report for anyone. The Reporting Managers (Admin, Lead),
 *  Co-ordinator — and HR, which resolves to Coordinator for access.
 *  Mirrored client-side in lib/access.ts. */
export function canSeePerformance(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Lead" || role === "Coordinator";
}

/** My Performance (/my-performance): Developers and Co-ordinators view
 *  their own review and fill in their self-rating and self-assessment.
 *  HR resolves to Coordinator, so HR staff get it too. Mirrored
 *  client-side in lib/access.ts. */
export function canSelfReview(role: SessionUser["role"]): boolean {
  return role === "Developer" || role === "Coordinator";
}

/** The one privilege HR has over a Co-ordinator: downloading the review
 *  as the official Word document. Checks the account's *real* role, so
 *  a plain Co-ordinator never qualifies. */
export function canDownloadPerformance(user: SessionUser): boolean {
  return user.primaryRole === "HR";
}

/** Who can rate and comment on a review: the Reporting Managers (every
 *  Admin and Lead) and HR. Co-ordinators read it. */
export function canEditPerformance(user: SessionUser): boolean {
  return isReportingManager(user.role) || user.primaryRole === "HR";
}

/** Employee ID, department, joining date and reporting line — HR master
 *  data, kept by HR and Admin. */
export function canEditEmployeeRecord(user: SessionUser): boolean {
  return user.role === "Admin" || user.primaryRole === "HR";
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

/** True when a status change takes a finished task back to open work —
 *  counted on Task.reopenCount as rework for performance reviews. */
export function isReopen(prev: string, next: string): boolean {
  return prev === "Done" && next !== "Done";
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
 *  BusinessDeveloper or Developer who is rostered on the project may add
 *  tasks — a developer raises their own work rather than waiting for a
 *  Lead to enter it, and may hand it to a teammate on the same project.
 *  Neither can manage the team or reassign an existing task; that stays
 *  with the Lead/Coordinator (see canManageProjectTasks). A Developer's
 *  choice of assignee is additionally confined to the project roster —
 *  see {@link assigneesOutsideProject}. */
export async function canCreateProjectTasks(
  user: SessionUser,
  projectId: number,
): Promise<boolean> {
  if (await canManageProjectTasks(user, projectId)) return true;
  if (user.role !== "BusinessDeveloper" && user.role !== "Developer") {
    return false;
  }
  return isProjectMember(user.id, projectId);
}

/** The projects the user is actually rostered on. Narrower than
 *  {@link visibleProjectIds}, which also picks up projects reached only via
 *  a task assignment. The forkable feed uses this so it never offers a Fork
 *  button that the fork endpoint would then refuse. */
export async function rosteredProjectIds(userId: string): Promise<number[]> {
  const rows = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return Array.from(new Set(rows.map((r) => r.projectId)));
}

/** True if the user holds any per-project role on this project. */
export async function isProjectMember(
  userId: string,
  projectId: number,
): Promise<boolean> {
  const row = await prisma.projectMember.findFirst({
    where: { projectId, userId },
    select: { userId: true },
  });
  return row !== null;
}

/** Of the given user ids, those NOT rostered on the project. Used to hold a
 *  Developer's assignment choices to their own project team: handing work to
 *  somebody who cannot even see the project helps nobody. Returns [] when
 *  every id checks out. */
export async function assigneesOutsideProject(
  projectId: number,
  userIds: string[],
): Promise<string[]> {
  if (!userIds.length) return [];
  const rostered = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: userIds } },
    select: { userId: true },
  });
  const ok = new Set(rostered.map((r) => r.userId));
  return userIds.filter((id) => !ok.has(id));
}

/** Prisma `where` fragment for the read-only "forkable" list: work on the
 *  user's own projects that belongs to somebody else. Their own tasks are
 *  excluded — the board at /my-tasks already covers those, and forking your
 *  own task would just duplicate it.
 *
 *  This is deliberately narrower than lifting canSeeAllProjectTasks: it is a
 *  read-only feed for picking up a colleague's work, not a project board. */
export function forkableTasksFilter(userId: string) {
  return {
    NOT: {
      OR: [{ assignees: { some: { userId } } }, { responsibleId: userId }],
    },
  };
}

/** Resolve a first name (what the client sends for people) to an account.
 *
 *  First names are not unique. When several accounts share one, `prefer`
 *  breaks the tie: the signed-in user themselves first (a Developer
 *  self-assigning must land on their own account), then someone rostered
 *  on `projectId` (the picker only offers the project's roster, so that is
 *  who the client meant), then any active account. Without this, the
 *  first row the database happened to return won — which could be a
 *  namesake who is not on the project, and the roster check then rejected
 *  a perfectly valid self-assignment. */
export async function userByFirstName(
  firstName: string,
  prefer: { projectId?: number; userId?: string } = {},
) {
  const q = firstName.trim().toLowerCase();
  if (!q) return null;
  // Matched in JS rather than with Prisma's `mode: "insensitive"`, which
  // is Postgres-only and throws against the SQLite dev database — the same
  // reason lib/auth.ts and lib/domain-auth.ts compare names this way.
  const everyone = await prisma.user.findMany();
  const matches = everyone.filter((u) => {
    const name = u.name.trim().toLowerCase();
    return name === q || name.startsWith(q + " ");
  });
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Where two people share a first name the UI names them in full
  // ("Pushpalata Patil" vs "Pushpalata" — see lib/short-name.ts), so a
  // full-name hit is the person meant; only fall through to the
  // self/roster/active preferences when the name itself is ambiguous.
  const tidy = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();
  const exact = matches.filter((u) => tidy(u.name) === tidy(q));
  if (exact.length === 1) return exact[0];

  if (prefer.userId) {
    const self = matches.find((u) => u.id === prefer.userId);
    if (self) return self;
  }
  if (prefer.projectId !== undefined) {
    const rostered = await prisma.projectMember.findMany({
      where: {
        projectId: prefer.projectId,
        userId: { in: matches.map((u) => u.id) },
      },
      select: { userId: true },
    });
    const onProject = new Set(rostered.map((r) => r.userId));
    const member =
      matches.find((u) => onProject.has(u.id) && u.isActive) ??
      matches.find((u) => onProject.has(u.id));
    if (member) return member;
  }
  return matches.find((u) => u.isActive) ?? matches[0];
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
