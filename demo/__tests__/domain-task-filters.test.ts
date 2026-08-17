import { describe, it, expect } from "vitest";
import {
  applyTaskFilters,
  hasActiveFilters,
  EMPTY_TASK_FILTERS,
  type FilterableTask,
} from "@/lib/domain-task-filter";

/**
 * Narrowing your own task list. The rules that matter:
 *
 *   - dates compare on when the task was ASSIGNED, because that is the one
 *     date every task has. Filtering on a due date would silently drop
 *     tasks that simply have none, which is the one thing a filter must
 *     never do.
 *   - a task with no project is a real category ("ad hoc"), not a missing
 *     value to be skipped.
 *   - "Rejected" is stored, "Sent back" is only how it is shown.
 */

type Row = FilterableTask & { id: number; targetDate?: string | null };

function task(over: Partial<Row> = {}): Row {
  return {
    id: 1,
    status: "Assigned",
    projectId: 7,
    createdById: "u-admin",
    createdAt: "2026-08-10T09:00:00.000Z",
    ...over,
  };
}

const F = EMPTY_TASK_FILTERS;

describe("my-task filters", () => {
  it("no filters returns everything, untouched", () => {
    const rows = [task({ id: 1 }), task({ id: 2 })];
    expect(applyTaskFilters(rows, F)).toHaveLength(2);
    expect(hasActiveFilters(F)).toBe(false);
  });

  it("narrows by who assigned it", () => {
    const rows = [
      task({ id: 1, createdById: "u-admin" }),
      task({ id: 2, createdById: "u-lead" }),
    ];
    const out = applyTaskFilters(rows, { ...F, createdBy: "u-lead" });
    expect(out.map((t) => t.id)).toEqual([2]);
  });

  it("narrows by project, and treats ad hoc as its own category", () => {
    const rows = [
      task({ id: 1, projectId: 7 }),
      task({ id: 2, projectId: 9 }),
      task({ id: 3, projectId: null }),
    ];
    expect(applyTaskFilters(rows, { ...F, project: "7" }).map((t) => t.id)).toEqual([1]);
    // Without this, a task belonging to no project could never be found —
    // it would fall through every project filter and out of "all" too.
    expect(applyTaskFilters(rows, { ...F, project: "adhoc" }).map((t) => t.id)).toEqual([3]);
  });

  it("narrows by status, using the stored value not the shown label", () => {
    const rows = [
      task({ id: 1, status: "Assigned" }),
      task({ id: 2, status: "Rejected" }),
      task({ id: 3, status: "Approved" }),
    ];
    expect(applyTaskFilters(rows, { ...F, status: "Rejected" }).map((t) => t.id)).toEqual([2]);
    expect(applyTaskFilters(rows, { ...F, status: "Sent back" })).toHaveLength(0);
  });

  it("folds legacy statuses the same way the rest of the module does", () => {
    // Rows written before the assign/approve flow carry "To Do".
    const rows = [task({ id: 1, status: "To Do" })];
    expect(applyTaskFilters(rows, { ...F, status: "Assigned" }).map((t) => t.id)).toEqual([1]);
  });

  it("filters on the assigned date, inclusive at both ends", () => {
    const rows = [
      task({ id: 1, createdAt: "2026-08-01T10:00:00.000Z" }),
      task({ id: 2, createdAt: "2026-08-10T10:00:00.000Z" }),
      task({ id: 3, createdAt: "2026-08-20T10:00:00.000Z" }),
    ];
    expect(
      applyTaskFilters(rows, { ...F, from: "2026-08-10", to: "2026-08-20" }).map((t) => t.id),
    ).toEqual([2, 3]);
    expect(applyTaskFilters(rows, { ...F, from: "2026-08-10" }).map((t) => t.id)).toEqual([2, 3]);
    expect(applyTaskFilters(rows, { ...F, to: "2026-08-01" }).map((t) => t.id)).toEqual([1]);
  });

  it("a task with no due date is never dropped by a date filter", () => {
    // The date rule reads createdAt, so an absent targetDate is irrelevant.
    const rows = [task({ id: 1, targetDate: null, createdAt: "2026-08-10T10:00:00.000Z" })];
    expect(applyTaskFilters(rows, { ...F, from: "2026-08-01" })).toHaveLength(1);
  });

  it("combines filters as AND, not OR", () => {
    const rows = [
      task({ id: 1, createdById: "u-lead", status: "Assigned" }),
      task({ id: 2, createdById: "u-lead", status: "Approved" }),
      task({ id: 3, createdById: "u-admin", status: "Assigned" }),
    ];
    const out = applyTaskFilters(rows, {
      ...F,
      createdBy: "u-lead",
      status: "Assigned",
    });
    expect(out.map((t) => t.id)).toEqual([1]);
  });

  it("knows when anything is set", () => {
    expect(hasActiveFilters({ ...F, status: "Approved" })).toBe(true);
    expect(hasActiveFilters({ ...F, from: "2026-08-01" })).toBe(true);
    expect(hasActiveFilters(F)).toBe(false);
  });
});
