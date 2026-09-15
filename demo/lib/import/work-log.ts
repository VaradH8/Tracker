/**
 * A hand-written work log — "these tasks, this person, these dates" — turned
 * into the rows the per-project importer already knows how to commit.
 *
 * Deliberately thin. All the hard parts (matching a task by title, resolving
 * people, stamping completedAt, staying idempotent) already live in
 * ./tasks.ts and are tested there; this only shapes the input. Pure — no DB,
 * no IO — so the mapping can be tested without a database.
 *
 * Every task in a log like this is finished by definition: it is a record of
 * work done, not a plan. So status is Done and the completion date is
 * required, which is what lets the weekly board file each task in the week
 * it was actually finished.
 */

import type { ParsedTaskRow } from "./tasks";

export type WorkLogTask = {
  title: string;
  /** Extra detail — line counts, a note about how a date was derived. */
  description?: string;
  /** When the work started, where it was recorded. Often it wasn't. */
  start?: string;
  /** When it finished. Required: a log of completed work without a
   *  completion date is the bug this whole path exists to avoid. */
  done: string;
};

export type WorkLogGroup = {
  project: string;
  client: string;
  /** First name, resolved against existing users by the committer. */
  assignee: string;
  /** Applied to every task in the group — typically what the work was part
   *  of, where that isn't already the project name. */
  remark?: string;
  tasks: WorkLogTask[];
};

export type WorkLog = { groups: WorkLogGroup[] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(iso: string, field: string, title: string): Date {
  if (!ISO.test(iso)) {
    throw new Error(`${title}: ${field} must be YYYY-MM-DD, got "${iso}"`);
  }
  const [y, m, d] = iso.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC rolls over rather than rejecting: month 13 becomes January of
  // the next year, day 45 walks into the month after that. A typo would
  // import as a real date on the wrong day, which is worse than a refusal.
  // So the only trustworthy check is that it reads back as what was typed.
  if (
    Number.isNaN(at.getTime()) ||
    at.getUTCFullYear() !== y ||
    at.getUTCMonth() !== m - 1 ||
    at.getUTCDate() !== d
  ) {
    throw new Error(`${title}: ${field} is not a real date ("${iso}")`);
  }
  return at;
}

/**
 * Map one group to task rows.
 *
 * targetDate is set to the completion date rather than left empty. The
 * committer falls back to `new Date()` for a missing target, which would
 * stamp today on work finished weeks ago.
 */
export function toTaskRows(group: WorkLogGroup): ParsedTaskRow[] {
  return group.tasks.map((t) => {
    const title = t.title.replace(/\s+/g, " ").trim();
    if (!title) throw new Error(`${group.project}: a task has no title`);
    const done = parseDay(t.done, "done", title);
    const start = t.start ? parseDay(t.start, "start", title) : null;
    if (start && start.getTime() > done.getTime()) {
      throw new Error(`${title}: start (${t.start}) is after done (${t.done})`);
    }
    return {
      title,
      description: t.description?.trim() || null,
      priority: "Medium",
      status: "Done",
      startDate: start,
      targetDate: done,
      completedAt: done,
      estimatedHours: null,
      assigneeNames: [group.assignee],
      responsibleName: group.assignee,
      remark: group.remark?.trim() ?? "",
    };
  });
}

/** Every group's rows, with the group kept alongside for the committer. */
export function toGroupedRows(
  log: WorkLog,
): { group: WorkLogGroup; rows: ParsedTaskRow[] }[] {
  return log.groups.map((group) => ({ group, rows: toTaskRows(group) }));
}

/** Total tasks in the log — the number the dry run reports back. */
export function countTasks(log: WorkLog): number {
  return log.groups.reduce((n, g) => n + g.tasks.length, 0);
}
