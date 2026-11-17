/**
 * Task writes for /api/v1: field whitelist (S-4), validation, attribution
 * (C-3) and field-level history (S-5). Shared by PATCH /tasks/{id},
 * POST /tasks and POST /tasks/bulk-update so all three behave the same.
 */
import { prisma } from "@/lib/db";
import { completedAtUpdate, isReopen, notifyUser } from "@/lib/server-access";
import type { ApiUser } from "./auth";
import { ApiError, notFound, parseDate } from "./http";
import {
  TASK_INCLUDE,
  canonicalPriority,
  canonicalStatus,
  serializeTask,
  type ApiTask,
  type TaskRow,
} from "./serialize";

/** PRD 6.1 — the only task fields an API account may write. */
export const WRITABLE_TASK_FIELDS = new Set([
  "title",
  "description",
  "project_id",
  "sprint_id",
  "parent_id",
  "assignee_id",
  "assignee_ids",
  "remove_assignee_id",
  "status",
  "priority",
  "estimate_hours",
  "progress_percent",
  "start_date",
  "due_date",
  "blocked",
  "blocked_reason",
  "tags",
]);
export const ATTRIBUTION_FIELDS = new Set(["source_note", "on_behalf_of_user_id"]);

export type Attribution = {
  sourceNote: string | null;
  onBehalfOfUserId: string | null;
  onBehalfOfName: string | null;
};

/** S-4: anything outside the whitelist is a 403 naming the field. */
export function rejectForbiddenFields(body: Record<string, unknown>, allowed: Set<string>) {
  for (const k of Object.keys(body)) {
    if (!allowed.has(k) && !ATTRIBUTION_FIELDS.has(k)) {
      throw new ApiError(403, "forbidden_field", `Field '${k}' is not writable by API accounts`, k);
    }
  }
}

/** C-3: optional source_note (<= 500 chars) and on_behalf_of_user_id. */
export async function readAttribution(
  body: Record<string, unknown>,
  fallback?: Attribution,
): Promise<Attribution> {
  const note = body.source_note;
  let sourceNote = fallback?.sourceNote ?? null;
  if (note !== undefined && note !== null) {
    if (typeof note !== "string") {
      throw new ApiError(422, "invalid", "source_note must be a string", "source_note");
    }
    if (note.length > 500) {
      throw new ApiError(422, "invalid", "source_note must be at most 500 characters", "source_note");
    }
    sourceNote = note.trim() || null;
  }
  const who = body.on_behalf_of_user_id;
  if (who === undefined || who === null) {
    return {
      sourceNote,
      onBehalfOfUserId: fallback?.onBehalfOfUserId ?? null,
      onBehalfOfName: fallback?.onBehalfOfName ?? null,
    };
  }
  if (typeof who !== "string" && typeof who !== "number") {
    throw new ApiError(422, "invalid", "on_behalf_of_user_id must be a user id", "on_behalf_of_user_id");
  }
  const person = await prisma.user.findUnique({
    where: { id: String(who) },
    select: { id: true, name: true, isServiceAccount: true },
  });
  if (!person || person.isServiceAccount) {
    throw new ApiError(422, "unknown_user", "on_behalf_of_user_id is not a known user", "on_behalf_of_user_id");
  }
  return { sourceNote, onBehalfOfUserId: person.id, onBehalfOfName: person.name };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

type TaskPatch = {
  title?: string;
  description?: string | null;
  projectId?: number;
  sprintId?: number | null;
  parentId?: number | null;
  /** Final assignee list after the request's add / remove / replace. */
  assigneeIds?: string[];
  /** People newly on the task, to notify. */
  addedAssignees?: string[];
  status?: string;
  priority?: string;
  estimatedHours?: number | null;
  progressPercent?: number;
  startDate?: Date | null;
  targetDate?: Date | null;
  blocked?: boolean;
  blockedReason?: string | null;
  tags?: string[];
};

const invalid = (field: string, message: string) => new ApiError(422, "invalid", message, field);

function optId(body: Record<string, unknown>, field: string): number | null | undefined {
  const v = body[field];
  if (v === undefined) return undefined;
  if (v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
    throw invalid(field, `${field} must be a positive integer or null`);
  }
  return n;
}

function optDate(body: Record<string, unknown>, field: string): Date | null | undefined {
  const v = body[field];
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = parseDate(v);
  if (!d) throw invalid(field, `${field} must be YYYY-MM-DD or null`);
  return d;
}

async function validateTaskPatch(
  body: Record<string, unknown>,
  existing: TaskRow | null,
): Promise<TaskPatch> {
  const p: TaskPatch = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) throw invalid("title", "title must be a non-empty string");
    if (body.title.length > 500) throw invalid("title", "title must be at most 500 characters");
    p.title = body.title.trim();
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      throw invalid("description", "description must be a string or null");
    }
    p.description = (body.description as string | null) || null;
  }
  const projectId = optId(body, "project_id");
  if (projectId === null) throw invalid("project_id", "project_id cannot be null");
  if (projectId !== undefined) p.projectId = projectId;
  const sprintId = optId(body, "sprint_id");
  if (sprintId !== undefined) p.sprintId = sprintId;
  const parentId = optId(body, "parent_id");
  if (parentId !== undefined) p.parentId = parentId;

  // Assignees. A task can have several:
  //   assignee_id         adds that person (no-op if already on it)
  //   remove_assignee_id  takes one person off
  //   assignee_ids        replaces the whole list (applied first)
  const oneId = (field: string): string | undefined => {
    const v = body[field];
    if (v === undefined) return undefined;
    if ((typeof v !== "string" && typeof v !== "number") || v === "") {
      throw invalid(
        field,
        `${field} must be a user id. To take people off a task use remove_assignee_id or assignee_ids`,
      );
    }
    return String(v);
  };
  const add = oneId("assignee_id");
  const remove = oneId("remove_assignee_id");
  let replace: string[] | undefined;
  if (body.assignee_ids !== undefined) {
    const v = body.assignee_ids;
    if (!Array.isArray(v) || v.length > 50 || v.some((x) => (typeof x !== "string" && typeof x !== "number") || x === "")) {
      throw invalid("assignee_ids", "assignee_ids must be an array of user ids");
    }
    replace = [...new Set(v.map(String))];
  }
  if (add !== undefined || remove !== undefined || replace !== undefined) {
    if (add !== undefined && add === remove) {
      throw invalid("remove_assignee_id", "Cannot add and remove the same person");
    }
    const current = existing ? existing.assignees.map((a) => a.userId) : [];
    let next = replace ?? current;
    if (add !== undefined && !next.includes(add)) next = [...next, add];
    if (remove !== undefined) next = next.filter((id) => id !== remove);
    p.assigneeIds = next;
    p.addedAssignees = next.filter((id) => !current.includes(id));
  }
  if (body.status !== undefined) {
    const s = canonicalStatus(body.status);
    if (!s) throw invalid("status", "status must be a value from /meta/statuses");
    p.status = s;
  }
  if (body.priority !== undefined) {
    const pr = canonicalPriority(body.priority);
    if (!pr) throw invalid("priority", "priority must be a value from /meta/priorities");
    p.priority = pr;
  }
  if (body.estimate_hours !== undefined) {
    const v = body.estimate_hours;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10_000)) {
      throw invalid("estimate_hours", "estimate_hours must be a number between 0 and 10000, or null");
    }
    p.estimatedHours = v as number | null;
  }
  if (body.progress_percent !== undefined) {
    const v = body.progress_percent;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) {
      throw invalid("progress_percent", "progress_percent must be an integer 0-100");
    }
    p.progressPercent = v;
  }
  const start = optDate(body, "start_date");
  if (start !== undefined) p.startDate = start;
  const due = optDate(body, "due_date");
  if (due !== undefined) p.targetDate = due;
  if (body.blocked !== undefined) {
    if (typeof body.blocked !== "boolean") throw invalid("blocked", "blocked must be true or false");
    p.blocked = body.blocked;
  }
  if (body.blocked_reason !== undefined) {
    const v = body.blocked_reason;
    if (v !== null && typeof v !== "string") throw invalid("blocked_reason", "blocked_reason must be a string or null");
    if (typeof v === "string" && v.length > 1000) throw invalid("blocked_reason", "blocked_reason is too long");
    p.blockedReason = (v as string | null)?.trim() || null;
  }
  if (body.tags !== undefined) {
    const v = body.tags;
    if (!Array.isArray(v) || v.length > 30 || v.some((t) => typeof t !== "string" || t.length > 50)) {
      throw invalid("tags", "tags must be an array of up to 30 strings (50 chars each)");
    }
    p.tags = [...new Set((v as string[]).map((t) => t.trim()).filter(Boolean))];
  }

  // --- references -------------------------------------------------
  const finalProjectId = p.projectId ?? existing?.projectId;
  if (p.projectId !== undefined) {
    const project = await prisma.project.findUnique({ where: { id: p.projectId }, select: { id: true } });
    if (!project) throw invalid("project_id", "Unknown project");
  }
  // Moving a task to another project drops it out of a sprint that
  // belongs to the old one, unless a new sprint was given too.
  if (p.projectId !== undefined && existing && p.projectId !== existing.projectId && p.sprintId === undefined) {
    p.sprintId = null;
  }
  const finalSprintId = p.sprintId !== undefined ? p.sprintId : existing?.sprintId;
  if (finalSprintId && (p.sprintId !== undefined || p.projectId !== undefined)) {
    const sprint = await prisma.sprint.findUnique({ where: { id: finalSprintId }, select: { projectId: true } });
    if (!sprint) throw invalid("sprint_id", "Unknown sprint");
    if (sprint.projectId !== finalProjectId) throw invalid("sprint_id", "Sprint belongs to a different project");
  }
  if (p.parentId) {
    if (existing && p.parentId === existing.id) throw invalid("parent_id", "A task cannot be its own parent");
    const parent = await prisma.task.findUnique({
      where: { id: p.parentId },
      select: { projectId: true, parentId: true },
    });
    if (!parent) throw invalid("parent_id", "Unknown parent task");
    if (parent.projectId !== finalProjectId) throw invalid("parent_id", "Parent task is in a different project");
    if (existing && parent.parentId === existing.id) throw invalid("parent_id", "That would make a parent/subtask loop");
  }
  // Only people being added need to be active team members; someone who
  // has since left can stay on a task they were already on.
  if (p.addedAssignees?.length) {
    const people = await prisma.user.findMany({
      where: { id: { in: p.addedAssignees }, isActive: true, isServiceAccount: false },
      select: { id: true },
    });
    const ok = new Set(people.map((u) => u.id));
    const bad = p.addedAssignees.find((id) => !ok.has(id));
    if (bad) {
      const field = body.assignee_ids !== undefined && body.assignee_id !== bad ? "assignee_ids" : "assignee_id";
      throw invalid(field, `${bad} is not an active team member`);
    }
  }

  // --- derived: blocked <-> status ---------------------------------
  const currentStatus = existing?.status ?? "To Do";
  if (p.blocked === true) {
    if (p.status && p.status !== "Blocked") throw invalid("blocked", "blocked=true conflicts with the status sent");
    p.status = "Blocked";
  } else if (p.blocked === false && !p.status && currentStatus === "Blocked") {
    p.status = "In Progress";
  }
  const finalStatus = p.status ?? currentStatus;
  if (finalStatus !== "Blocked" && currentStatus === "Blocked" && p.blockedReason === undefined && existing?.blockedReason) {
    p.blockedReason = null;
  }
  // Done means done: bump progress unless the caller set it themselves.
  if (p.status === "Done" && p.progressPercent === undefined && (existing?.progressPercent ?? 0) < 100) {
    p.progressPercent = 100;
  }
  delete p.blocked;
  return p;
}

/* ------------------------------------------------------------------ */
/* Change detection                                                    */
/* ------------------------------------------------------------------ */

type Change = { field: string; old: unknown; new: unknown };

/** API-side field name for each patch key, and its API representation. */
function apiView(p: TaskPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
  if (p.title !== undefined) out.title = p.title;
  if (p.description !== undefined) out.description = p.description ?? "";
  if (p.projectId !== undefined) out.project_id = p.projectId;
  if (p.sprintId !== undefined) out.sprint_id = p.sprintId;
  if (p.parentId !== undefined) out.parent_id = p.parentId;
  if (p.assigneeIds !== undefined) out.assignee_ids = p.assigneeIds;
  if (p.status !== undefined) out.status = p.status;
  if (p.priority !== undefined) out.priority = p.priority;
  if (p.estimatedHours !== undefined) out.estimate_hours = p.estimatedHours;
  if (p.progressPercent !== undefined) out.progress_percent = p.progressPercent;
  if (p.startDate !== undefined) out.start_date = d(p.startDate);
  if (p.targetDate !== undefined) out.due_date = d(p.targetDate);
  if (p.blockedReason !== undefined) out.blocked_reason = p.blockedReason;
  if (p.tags !== undefined) out.tags = p.tags;
  return out;
}

function diff(before: ApiTask, p: TaskPatch): Change[] {
  const changes: Change[] = [];
  for (const [field, next] of Object.entries(apiView(p))) {
    const prev = (before as Record<string, unknown>)[field];
    if (JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null)) {
      changes.push({ field, old: prev ?? null, new: next ?? null });
    }
  }
  return changes;
}

function prismaData(p: TaskPatch, existingStatus: string) {
  const data: Record<string, unknown> = {};
  if (p.title !== undefined) data.title = p.title;
  if (p.description !== undefined) data.description = p.description;
  if (p.projectId !== undefined) data.projectId = p.projectId;
  if (p.sprintId !== undefined) data.sprintId = p.sprintId;
  if (p.parentId !== undefined) data.parentId = p.parentId;
  if (p.priority !== undefined) data.priority = p.priority;
  if (p.estimatedHours !== undefined) data.estimatedHours = p.estimatedHours;
  if (p.progressPercent !== undefined) data.progressPercent = p.progressPercent;
  if (p.startDate !== undefined) data.startDate = p.startDate;
  if (p.targetDate !== undefined) data.targetDate = p.targetDate;
  if (p.blockedReason !== undefined) data.blockedReason = p.blockedReason;
  if (p.tags !== undefined) data.tags = JSON.stringify(p.tags);
  if (p.status !== undefined && p.status !== existingStatus) {
    data.status = p.status;
    const completedAt = completedAtUpdate(existingStatus, p.status);
    if (completedAt !== undefined) data.completedAt = completedAt;
    if (isReopen(existingStatus, p.status)) data.reopenCount = { increment: 1 };
  }
  return data;
}

function short(v: unknown): string {
  const s = v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : String(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

function attributionSuffix(actor: ApiUser, attr: Attribution): string {
  let s = ` — via ${actor.name}`;
  if (attr.onBehalfOfName) s += ` on behalf of ${attr.onBehalfOfName}`;
  if (attr.sourceNote) s += `: ${attr.sourceNote}`;
  return s;
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

export async function loadTask(id: number): Promise<TaskRow> {
  const t = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  if (!t) throw notFound("Task");
  return t;
}

export async function updateTask(
  taskId: number,
  body: Record<string, unknown>,
  actor: ApiUser,
  attr: Attribution,
  origin: string | null,
): Promise<ApiTask> {
  rejectForbiddenFields(body, WRITABLE_TASK_FIELDS);
  const existing = await loadTask(taskId);
  const patch = await validateTaskPatch(body, existing);
  const before = serializeTask(existing);
  const changes = diff(before, patch);
  if (changes.length === 0) return before;

  const data = prismaData(patch, existing.status);
  const assigneeChange = changes.find((c) => c.field === "assignee_ids");
  const reasonChange = changes.find((c) => c.field === "blocked_reason" && c.new);
  const project = await prisma.project.findUnique({
    where: { id: patch.projectId ?? existing.projectId },
    select: { name: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data });
    if (assigneeChange) {
      // Touch only the rows that change, so existing assignees keep
      // their original "assigned at" time and order.
      const next = patch.assigneeIds ?? [];
      await tx.taskAssignee.deleteMany({ where: { taskId, userId: { notIn: next } } });
      const added = patch.addedAssignees ?? [];
      if (added.length) {
        await tx.taskAssignee.createMany({ data: added.map((userId) => ({ taskId, userId })) });
      }
    }
    await tx.taskHistory.createMany({
      data: changes.map((c) => ({
        taskId,
        field: c.field,
        oldValue: JSON.stringify(c.old ?? null),
        newValue: JSON.stringify(c.new ?? null),
        changedById: actor.id,
        onBehalfOfUserId: attr.onBehalfOfUserId,
        sourceNote: attr.sourceNote,
      })),
    });
    // The UI's History tab reads AuditEntry, so the change shows there as
    // made by the service account, with who it was for and why.
    await tx.auditEntry.create({
      data: {
        actorId: actor.id,
        action: changes.some((c) => c.field === "status") ? "task.status_change" : "task.update",
        scope: project?.name,
        taskTitle: patch.title ?? existing.title,
        before: changes.map((c) => `${c.field}: ${short(c.old)}`).join("; "),
        after:
          changes.map((c) => `${c.field}: ${short(c.new)}`).join("; ") +
          attributionSuffix(actor, attr),
      },
    });
    // Same as the UI: a blocker reason is also posted as a remark so the
    // people on the task see it in the thread.
    if (reasonChange) {
      await tx.remark.create({
        data: {
          taskId,
          authorId: actor.id,
          body: `Blocked: ${reasonChange.new}`,
          onBehalfOfUserId: attr.onBehalfOfUserId,
          sourceNote: attr.sourceNote,
        },
      });
    }
  });

  if (assigneeChange) {
    for (const userId of patch.addedAssignees ?? []) {
      if (userId !== attr.onBehalfOfUserId) {
        await notifyAssigned(userId, patch.title ?? existing.title, taskId, actor, origin);
      }
    }
  }
  return serializeTask(await loadTask(taskId));
}

export async function createTask(
  body: Record<string, unknown>,
  actor: ApiUser,
  attr: Attribution,
  origin: string | null,
): Promise<ApiTask> {
  rejectForbiddenFields(body, WRITABLE_TASK_FIELDS);
  if (body.title === undefined) throw new ApiError(422, "missing_field", "title is required", "title");
  if (body.project_id === undefined) throw new ApiError(422, "missing_field", "project_id is required", "project_id");
  const p = await validateTaskPatch(body, null);
  const status = p.status ?? "To Do";

  const created = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: p.title!,
        description: p.description ?? null,
        projectId: p.projectId!,
        sprintId: p.sprintId ?? null,
        parentId: p.parentId ?? null,
        priority: p.priority ?? "Medium",
        status,
        estimatedHours: p.estimatedHours ?? null,
        progressPercent: p.progressPercent ?? 0,
        startDate: p.startDate ?? null,
        targetDate: p.targetDate ?? null,
        blockedReason: p.blockedReason ?? null,
        tags: JSON.stringify(p.tags ?? []),
        completedAt: status === "Done" || status === "Cancelled" ? new Date() : null,
        responsibleId: actor.id,
        ...(p.assigneeIds?.length
          ? { assignees: { create: p.assigneeIds.map((userId) => ({ userId })) } }
          : {}),
      },
      include: { project: { select: { name: true } } },
    });
    await tx.taskHistory.create({
      data: {
        taskId: task.id,
        field: "created",
        oldValue: "null",
        newValue: JSON.stringify(task.title),
        changedById: actor.id,
        onBehalfOfUserId: attr.onBehalfOfUserId,
        sourceNote: attr.sourceNote,
      },
    });
    await tx.auditEntry.create({
      data: {
        actorId: actor.id,
        action: "task.create",
        scope: task.project.name,
        taskTitle: task.title,
        after: `created${attributionSuffix(actor, attr)}`,
      },
    });
    return task;
  });

  for (const userId of p.assigneeIds ?? []) {
    if (userId !== attr.onBehalfOfUserId) {
      await notifyAssigned(userId, created.title, created.id, actor, origin);
    }
  }
  return serializeTask(await loadTask(created.id));
}

async function notifyAssigned(
  userId: string,
  title: string,
  taskId: number,
  actor: ApiUser,
  origin: string | null,
) {
  await notifyUser(userId, {
    kind: "assigned",
    title: "Assigned to a task",
    body: title,
    taskId,
    actorName: actor.name,
    baseUrl: origin,
  }).catch((e) => console.error("[api/v1] notify failed", e));
}
