/**
 * One shape for a task across every endpoint that returns one.
 *
 * The list route, the update route and the review transitions each built
 * their own response object, so a field added for the assignment flow had
 * to be remembered in three places — and the update route had already
 * drifted, returning fewer fields than the list. One serializer removes
 * the question.
 */

import { normaliseTaskPriority } from "@/lib/domain";

export const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  division: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  editedBy: { select: { id: true, name: true } },
  /** Named in the order they were asked, so the list reads the way the
   *  assigner wrote it rather than by id. */
  reviewers: {
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { id: "asc" },
  },
  attachments: {
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  },
  events: {
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { at: "asc" },
  },
} as const;

export type TaskEventRow = {
  id: number;
  kind: string;
  note: string | null;
  detail: string | null;
  at: Date;
  actor: { id: string; name: string; role: string };
};

/**
 * Work someone picked up themselves rather than being given.
 *
 * Derived rather than stored: a task whose creator is also its assignee
 * had no one to hand it over, so there is no one to sign it off either.
 * Keeping it a derivation means the two facts can never disagree.
 */
function isSelfCreated(t: {
  createdBy: { id: string };
  assignee: { id: string } | null;
}): boolean {
  return !!t.assignee && t.assignee.id === t.createdBy.id;
}

export type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  startDate: Date | null;
  targetDate: Date | null;
  estimatedHours: number | null;
  hoursSpent: number | null;
  createdAt: Date;
  submittedOn: Date | null;
  submittedNote: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  project: { id: number; name: string } | null;
  division: { id: number; name: string } | null;
  assignee: { id: string; name: string; role: string } | null;
  createdBy: { id: string; name: string };
  reviewedBy: { id: string; name: string } | null;
  priority: string;
  includesWeekends: boolean;
  editedAt: Date | null;
  editedBy: { id: string; name: string } | null;
  reviewers?: {
    userId: string;
    decision: string;
    decidedAt: Date | null;
    note: string | null;
    user: { id: string; name: string; role: string };
  }[];
  attachments?: {
    id: number;
    side: string;
    name: string;
    size: string;
    kind: string;
    createdAt: Date;
    uploadedBy: { id: string; name: string } | null;
  }[];
  events?: TaskEventRow[];
};

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * `withHistory` decides whether the full trail travels with the task.
 *
 * It is off by default because the trail names who rejected whose work and
 * why. The people who supervise delivery need that; the person being
 * supervised does not need to read every remark made about their work in
 * a list they can page through. Callers opt in — see the tasks routes,
 * which pass it only for Admins, Leads and Team Leads.
 */
export function serializeTask(t: TaskRow, withHistory = false) {
  return {
    ...(withHistory && t.events
      ? {
          history: t.events.map((e) => ({
            id: e.id,
            kind: e.kind,
            note: e.note,
            detail: e.detail,
            at: e.at.toISOString(),
            actor: e.actor.name,
            actorRole: e.actor.role,
          })),
        }
      : {}),
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    startDate: day(t.startDate),
    targetDate: day(t.targetDate),
    /** What the assigner budgeted, and what it actually took. Both
     *  travel: one without the other is half a sentence. */
    estimatedHours: t.estimatedHours,
    hoursSpent: t.hoursSpent,
    /** Null on an ad-hoc task — work that belongs to no project. */
    projectId: t.project?.id ?? null,
    projectName: t.project?.name ?? null,
    divisionId: t.division?.id ?? null,
    divisionName: t.division?.name ?? null,
    assignee: t.assignee?.name ?? null,
    assigneeId: t.assignee?.id ?? null,
    assigneeRole: t.assignee?.role ?? null,
    /** Who handed it out. Reviewing is a separate list — see reviewers. */
    createdBy: t.createdBy.name,
    createdById: t.createdBy.id,
    createdAt: t.createdAt.toISOString(),
    submittedOn: day(t.submittedOn),
    submittedNote: t.submittedNote,
    submittedAt: t.submittedAt ? t.submittedAt.toISOString() : null,
    reviewedBy: t.reviewedBy?.name ?? null,
    reviewedAt: t.reviewedAt ? t.reviewedAt.toISOString() : null,
    reviewNote: t.reviewNote,
    priority: normaliseTaskPriority(t.priority),
    includesWeekends: t.includesWeekends,
    /** Set only when the brief changed after it went out — see the route. */
    editedAt: t.editedAt ? t.editedAt.toISOString() : null,
    editedBy: t.editedBy?.name ?? null,
    /**
     * Everyone asked, whether or not they acted.
     *
     * The whole set travels, not a count and not just the one who
     * decided: any single approval closes a task, so a closed one can
     * have been read by one person out of three. Only the names make
     * that visible.
     */
    reviewers: (t.reviewers ?? []).map((r) => ({
      id: r.userId,
      name: r.user.name,
      role: r.user.role,
      decision: r.decision,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      note: r.note,
    })),
    /** Split by side so a reviewer can tell the brief from the answer. */
    attachments: (t.attachments ?? []).map((a) => ({
      id: a.id,
      side: a.side,
      name: a.name,
      size: a.size,
      kind: a.kind,
      uploadedBy: a.uploadedBy?.name ?? null,
      at: a.createdAt.toISOString(),
    })),
    selfCreated: isSelfCreated(t),
  };
}
