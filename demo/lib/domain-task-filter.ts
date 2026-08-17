import { normaliseTaskStatus } from "./domain";

/**
 * Narrowing a task list, as a pure function.
 *
 * Kept out of the component that renders the controls for the same reason
 * the rest of this module's rules live in lib/: the logic is worth testing
 * on its own, and a filter that quietly drops rows is the kind of bug that
 * only shows up when someone notices work missing.
 */

export type FilterableTask = {
  createdById?: string;
  projectId: number | null;
  status: string;
  /** ISO timestamp of when the task was assigned. */
  createdAt: string;
};

export type TaskFilters = {
  /** Who handed the task out. "" = anyone. */
  createdBy: string;
  /** Project id as a string, "adhoc" for tasks with no project, "" = any. */
  project: string;
  /** A task status, "" = any. */
  status: string;
  /** Assigned-date range, inclusive, ISO. */
  from: string;
  to: string;
};

export const EMPTY_TASK_FILTERS: TaskFilters = {
  createdBy: "",
  project: "",
  status: "",
  from: "",
  to: "",
};

export function hasActiveFilters(f: TaskFilters): boolean {
  return Object.values(f).some((v) => v !== "");
}

/**
 * Dates compare on when the task was ASSIGNED, not when it is due or when
 * it was submitted. Every task has an assigned date; the other two are
 * optional, so filtering on them would silently drop rows that simply have
 * none rather than narrow the list — the one thing a filter must never do.
 *
 * Status is compared through `normaliseTaskStatus`, so rows written before
 * the assign/approve flow existed (they carry "To Do") are found under
 * Assigned rather than being unreachable.
 */
export function applyTaskFilters<T extends FilterableTask>(
  tasks: T[],
  f: TaskFilters,
): T[] {
  return tasks.filter((t) => {
    if (f.createdBy && t.createdById !== f.createdBy) return false;
    if (f.project) {
      // A task on no project is a real category, not a missing value.
      const key = t.projectId == null ? "adhoc" : String(t.projectId);
      if (key !== f.project) return false;
    }
    if (f.status && normaliseTaskStatus(t.status) !== f.status) return false;
    if (f.from || f.to) {
      const day = (t.createdAt ?? "").slice(0, 10);
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
    }
    return true;
  });
}
