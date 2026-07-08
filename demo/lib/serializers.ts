import type {
  AppNotification,
  Client,
  EmailLogEntry,
  LeaveEntry,
  PipelineDeal,
  Priority,
  Project,
  Remark,
  Status,
  Task,
  TaskAttachment,
  TimeEntry,
  AuditEntry,
} from "./mock";

/**
 * Reshape Prisma rows into the client-side types the UI already speaks
 * (first names instead of cuid ids, ISO date strings, relative "when",
 * etc.). Keeps the existing components untouched.
 */

/* ------------------------------------------------------------------ */
/* Projects + Clients                                                  */
/* ------------------------------------------------------------------ */

type PrismaProject = {
  id: number;
  name: string;
  clientId: number;
  status: string;
  members?: { user: { name: string }; role: string }[];
  startDate: Date;
  targetDate: Date;
  budgetHours: number;
  loggedHours: number;
  progress: number;
  health: string;
  description: string | null;
};

export function serializeProject(p: PrismaProject): Project {
  const namesByRole = (role: string) =>
    Array.from(
      new Set(
        (p.members ?? [])
          .filter((m) => m.role === role)
          .map((m) => m.user.name.split(" ")[0]),
      ),
    );
  return {
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    status: p.status as Project["status"],
    leads: namesByRole("Lead"),
    coordinators: namesByRole("Coordinator"),
    developers: namesByRole("Developer"),
    bds: namesByRole("BD"),
    startDate: p.startDate.toISOString().slice(0, 10),
    targetDate: p.targetDate.toISOString().slice(0, 10),
    budgetHours: p.budgetHours,
    loggedHours: p.loggedHours,
    progress: p.progress,
    health: p.health as Project["health"],
    description: p.description ?? undefined,
  };
}

type PrismaClient = {
  id: number;
  name: string;
  industry: string;
  primaryContact: string;
  email: string;
  since: Date;
};

export function serializeClient(c: PrismaClient): Client {
  return {
    id: c.id,
    name: c.name,
    industry: c.industry,
    primaryContact: c.primaryContact,
    email: c.email,
    since: c.since.toISOString().slice(0, 10),
  };
}

/* ------------------------------------------------------------------ */
/* Tasks + sub-entities                                                */
/* ------------------------------------------------------------------ */

type PrismaTask = {
  id: number;
  title: string;
  description: string | null;
  projectId: number;
  priority: string;
  status: string;
  startDate: Date | null;
  targetDate: Date;
  estimatedHours: number | null;
  actualHours: number | null;
  important: boolean;
  overdueDays: number | null;
  completedAt: Date | null;
  responsibleId: string | null;
  responsible?: { name: string } | null;
  approvedById: string | null;
  approvedBy?: { name: string } | null;
  approvedAt: Date | null;
  assignees?: { user: { name: string } }[];
  remarks?: PrismaRemark[];
  attachments?: PrismaAttachment[];
  blockedBy?: { blockerTaskId: number }[];
};

export function serializeTask(t: PrismaTask): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    projectId: t.projectId,
    priority: t.priority as Priority,
    status: t.status as Status,
    responsible: t.responsible?.name.split(" ")[0] ?? "",
    assignees: (t.assignees ?? []).map((a) => a.user.name.split(" ")[0]),
    startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : undefined,
    targetDate: t.targetDate.toISOString().slice(0, 10),
    estimatedHours: t.estimatedHours,
    actualHours: t.actualHours ?? undefined,
    important: t.important,
    overdueDays: overdueDaysFor(t.targetDate, t.status),
    completedAt: t.completedAt ? t.completedAt.toISOString().slice(0, 10) : null,
    remarks: (t.remarks ?? []).map(serializeRemark),
    attachments: (t.attachments ?? []).map(serializeAttachment),
    dependsOn: (t.blockedBy ?? []).map((d) => d.blockerTaskId),
    approvedBy: t.approvedBy?.name.split(" ")[0],
    approvedAt: t.approvedAt ? relativeWhen(t.approvedAt) : undefined,
  };
}

type PrismaRemark = {
  id: number;
  authorId: string;
  author?: { name: string } | null;
  body: string;
  createdAt: Date;
};

export function serializeRemark(r: PrismaRemark): Remark {
  return {
    id: r.id,
    author: r.author?.name.split(" ")[0] ?? "—",
    body: r.body,
    when: relativeWhen(r.createdAt),
  };
}

type PrismaAttachment = {
  id: number;
  name: string;
  size: string;
  kind: string;
  uploadedById: string | null;
  uploadedBy?: { name: string } | null;
  createdAt: Date;
};

export function serializeAttachment(a: PrismaAttachment): TaskAttachment {
  return {
    id: a.id,
    name: a.name,
    size: a.size,
    kind: (["pdf", "image", "doc", "sheet"].includes(a.kind)
      ? a.kind
      : "other") as TaskAttachment["kind"],
    uploadedBy: a.uploadedBy?.name.split(" ")[0] ?? "—",
    when: relativeWhen(a.createdAt),
  };
}

type PrismaTimeEntry = {
  id: number;
  taskId: number;
  userId: string;
  user?: { name: string } | null;
  date: Date;
  hours: number | null;
  note: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
};

export function serializeTimeEntry(t: PrismaTimeEntry): TimeEntry {
  return {
    id: t.id,
    taskId: t.taskId,
    person: t.user?.name.split(" ")[0] ?? "—",
    date: t.date.toISOString().slice(0, 10),
    hours: t.hours ?? 0,
    note: t.note ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Audit, Notifications, EmailLog                                      */
/* ------------------------------------------------------------------ */

type PrismaAudit = {
  id: number;
  actorId: string | null;
  actor?: { name: string } | null;
  action: string;
  scope: string | null;
  taskTitle: string | null;
  before: string | null;
  after: string | null;
  createdAt: Date;
};

export function serializeAudit(a: PrismaAudit): AuditEntry {
  return {
    id: a.id,
    actor: a.actor?.name.split(" ")[0] ?? "(removed user)",
    action: a.action,
    scope: a.scope ?? "—",
    taskTitle: a.taskTitle ?? undefined,
    before: a.before ?? undefined,
    after: a.after ?? undefined,
    when: relativeWhen(a.createdAt),
    whenExact: a.createdAt.toISOString(),
  };
}

type PrismaNotification = {
  id: number;
  userId: string;
  user?: { name: string } | null;
  kind: string;
  title: string;
  body: string;
  taskId: number | null;
  isRead: boolean;
  createdAt: Date;
};

export function serializeNotification(n: PrismaNotification): AppNotification {
  return {
    id: n.id,
    recipient: n.user?.name.split(" ")[0] ?? "—",
    kind: n.kind as AppNotification["kind"],
    title: n.title,
    body: n.body,
    taskId: n.taskId ?? undefined,
    when: relativeWhen(n.createdAt),
    read: n.isRead,
  };
}

type PrismaEmail = {
  id: number;
  recipientId: string | null;
  recipient?: { name: string } | null;
  toEmail: string;
  subject: string;
  body: string;
  kind: string;
  taskId: number | null;
  createdAt: Date;
};

export function serializeEmail(e: PrismaEmail): EmailLogEntry {
  return {
    id: e.id,
    to: e.recipient?.name.split(" ")[0] ?? e.toEmail.split("@")[0],
    toEmail: e.toEmail,
    subject: e.subject,
    body: e.body,
    kind: e.kind as EmailLogEntry["kind"],
    taskId: e.taskId ?? undefined,
    when: relativeWhen(e.createdAt),
  };
}

/* ------------------------------------------------------------------ */
/* Leaves + Pipeline                                                   */
/* ------------------------------------------------------------------ */

type PrismaLeave = {
  id: number;
  userId: string;
  user?: { name: string } | null;
  start: Date;
  end: Date;
  type: string;
  note: string | null;
  approved: boolean;
};

export function serializeLeave(l: PrismaLeave): LeaveEntry {
  return {
    id: l.id,
    resourceName: l.user?.name ?? "—",
    start: l.start.toISOString().slice(0, 10),
    end: l.end.toISOString().slice(0, 10),
    type: l.type,
    note: l.note ?? undefined,
    approved: l.approved,
  };
}

type PrismaPipeline = {
  id: number;
  name: string;
  clientName: string;
  estimatedValue: number;
  probability: number;
  stage: string;
  expectedStart: Date | null;
  bdName: string | null;
};

export function serializePipeline(d: PrismaPipeline): PipelineDeal {
  return {
    id: d.id,
    name: d.name,
    client: d.clientName,
    estimatedValue: d.estimatedValue,
    probability: d.probability,
    stage: d.stage as PipelineDeal["stage"],
    expectedStart: d.expectedStart
      ? d.expectedStart.toISOString().slice(0, 10)
      : "—",
    bd: d.bdName ?? "—",
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function overdueDaysFor(
  targetDate: Date,
  status: string,
): number | undefined {
  if (status === "Done") return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  const diff = Math.floor(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff > 0 ? diff : undefined;
}

export function relativeWhen(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}
