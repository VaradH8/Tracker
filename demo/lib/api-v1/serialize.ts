/**
 * Prisma rows -> /api/v1 shapes (PRD section 6). Only the fields listed
 * here ever leave the API: performance signals, pay, ratings and review
 * data on User are deliberately never read into these shapes (S-1).
 */
import type { Prisma } from "@prisma/client";
import { fmtDate, fmtTs } from "./http";

/** Workflow order — what /meta/statuses returns. */
export const STATUSES = ["To Do", "In Progress", "In review", "Blocked", "Done", "Cancelled"] as const;
/** Lowest to highest — what /meta/priorities returns. */
export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const OPEN_STATUSES = ["To Do", "In Progress", "In review", "Blocked"];
export const SPRINT_STATUSES = ["planned", "active", "closed"] as const;

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** Case/spacing-insensitive match to the canonical value ("in review" -> "In review"). */
export function canonicalStatus(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return STATUSES.find((s) => norm(s) === norm(raw)) ?? null;
}
export function canonicalPriority(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return PRIORITIES.find((p) => norm(p) === norm(raw)) ?? null;
}

export const DEFAULT_TIMEZONE = process.env.API_V1_DEFAULT_TIMEZONE || "Asia/Kolkata";

export function projectKey(p: { id: number; key: string | null }): string {
  return p.key || `P${p.id}`;
}

/* ------------------------------------------------------------------ */

export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  primaryRole: true,
  isActive: true,
  isServiceAccount: true,
  capacityPerWeek: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export function serializeUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.isServiceAccount ? "Service Account" : u.primaryRole,
    active: u.isActive,
    weekly_capacity_hours: u.capacityPerWeek,
    timezone: DEFAULT_TIMEZONE,
  };
}

/* ------------------------------------------------------------------ */

export const PROJECT_INCLUDE = {
  members: { select: { userId: true } },
  client: { select: { name: true } },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

export function serializeProject(p: ProjectRow) {
  return {
    id: p.id,
    key: projectKey(p),
    name: p.name,
    status: p.status,
    client: p.client?.name ?? null,
    member_ids: [...new Set(p.members.map((m) => m.userId))],
    start_date: fmtDate(p.startDate),
    target_end_date: fmtDate(p.targetDate),
  };
}

/* ------------------------------------------------------------------ */

export const SPRINT_INCLUDE = {
  tasks: { select: { id: true }, orderBy: { id: "asc" } },
} satisfies Prisma.SprintInclude;

type SprintRow = Prisma.SprintGetPayload<{ include: typeof SPRINT_INCLUDE }>;

export function serializeSprint(s: SprintRow) {
  return {
    id: s.id,
    project_id: s.projectId,
    name: s.name,
    goal: s.goal ?? "",
    start_date: fmtDate(s.startDate),
    end_date: fmtDate(s.endDate),
    status: s.status,
    task_ids: s.tasks.map((t) => t.id),
    created_at: fmtTs(s.createdAt),
    updated_at: fmtTs(s.updatedAt),
  };
}

/* ------------------------------------------------------------------ */

export const TASK_INCLUDE = {
  project: { select: { id: true, key: true } },
  assignees: { select: { userId: true }, orderBy: { createdAt: "asc" } },
  timeEntries: { select: { hours: true } },
  blockedBy: { select: { blockerTaskId: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

export function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function serializeTask(t: TaskRow) {
  const logged = t.timeEntries.reduce((sum, e) => sum + (e.hours ?? 0), 0);
  const assigneeIds = t.assignees.map((a) => a.userId);
  return {
    id: t.id,
    key: `${projectKey(t.project)}-${t.id}`,
    title: t.title,
    description: t.description ?? "",
    project_id: t.projectId,
    sprint_id: t.sprintId,
    parent_id: t.parentId,
    // The tracker allows several people on a task ("Person Accountable").
    // assignee_id is the first of them; assignee_ids is the full list.
    assignee_id: assigneeIds[0] ?? null,
    assignee_ids: assigneeIds,
    reporter_id: t.responsibleId,
    status: t.status,
    priority: t.priority,
    estimate_hours: t.estimatedHours,
    logged_hours: Math.round((logged > 0 ? logged : (t.actualHours ?? 0)) * 100) / 100,
    progress_percent: t.status === "Done" ? Math.max(t.progressPercent, 100) : t.progressPercent,
    start_date: fmtDate(t.startDate),
    due_date: fmtDate(t.targetDate),
    completed_at: fmtTs(t.completedAt),
    blocked: t.status === "Blocked",
    blocked_reason: t.blockedReason,
    blocked_by: t.blockedBy.map((d) => d.blockerTaskId).sort((a, b) => a - b),
    tags: parseTags(t.tags),
    created_at: fmtTs(t.createdAt),
    updated_at: fmtTs(t.updatedAt),
  };
}

export type ApiTask = ReturnType<typeof serializeTask>;
