/**
 * One shape for a task across every endpoint that returns one.
 *
 * The list route, the update route and the review transitions each built
 * their own response object, so a field added for the assignment flow had
 * to be remembered in three places — and the update route had already
 * drifted, returning fewer fields than the list. One serializer removes
 * the question.
 */

export const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  division: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, role: true } },
  createdBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
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
    estimatedHours: t.estimatedHours,
    /** Null on an ad-hoc task — work that belongs to no project. */
    projectId: t.project?.id ?? null,
    projectName: t.project?.name ?? null,
    divisionId: t.division?.id ?? null,
    divisionName: t.division?.name ?? null,
    assignee: t.assignee?.name ?? null,
    assigneeId: t.assignee?.id ?? null,
    assigneeRole: t.assignee?.role ?? null,
    /** Who handed it out — the only person who may review it. */
    createdBy: t.createdBy.name,
    createdById: t.createdBy.id,
    createdAt: t.createdAt.toISOString(),
    submittedOn: day(t.submittedOn),
    submittedNote: t.submittedNote,
    submittedAt: t.submittedAt ? t.submittedAt.toISOString() : null,
    reviewedBy: t.reviewedBy?.name ?? null,
    reviewedAt: t.reviewedAt ? t.reviewedAt.toISOString() : null,
    reviewNote: t.reviewNote,
    selfCreated: isSelfCreated(t),
  };
}
