"use client";

import { useMemo } from "react";
import { DOMAIN_TASK_STATUSES } from "@/lib/domain";
import {
  EMPTY_TASK_FILTERS,
  hasActiveFilters,
  type TaskFilters,
} from "@/lib/domain-task-filter";
import { dateClass, selectClass } from "@/lib/domain-ui";
import type { DomainTask } from "@/components/DomainTaskList";
import { DateInput } from "@/components/DateInput";
import { SearchSelect } from "@/components/SearchSelect";

/**
 * Filtering your own task list.
 *
 * Applied to the tasks already on the page rather than by re-querying:
 * "my tasks" is one person's list, it arrives in full, and filtering it
 * in the browser answers instantly with no chance of the filters and the
 * list disagreeing about what was fetched.
 *
 * The dropdowns are built from the tasks themselves, so they can only
 * offer values that will actually match something — a filter that can
 * select an empty result wastes the reader's time.
 */

/** "Rejected" reads harshly for what is really "have another go". */
function statusLabel(s: string): string {
  return s === "Rejected" ? "Sent back" : s;
}

export function DomainTaskFilters({
  tasks,
  filters,
  onChange,
  matched,
}: {
  /** The unfiltered list — the options are derived from it. */
  tasks: DomainTask[];
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  /** How many survived, so the bar can say what it did. */
  matched: number;
}) {
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) {
      if (t.createdById) m.set(t.createdById, t.createdBy);
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [tasks]);

  const projects = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) {
      if (t.projectId == null) m.set("adhoc", "Ad hoc — no project");
      else m.set(String(t.projectId), t.projectName ?? `Project ${t.projectId}`);
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [tasks]);

  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  const active = hasActiveFilters(filters);

  // Nothing to narrow.
  if (tasks.length === 0) return null;

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Assigned by</span>
          <SearchSelect
            value={filters.createdBy}
            onChange={(v) => set({ createdBy: v })}
            size="sm"
            className="min-w-[150px]"
            placeholder="Anyone"
            searchPlaceholder="Search people"
            options={people.map((p) => ({ value: p.id, label: p.name }))}
          />
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Project</span>
          <SearchSelect
            value={filters.project}
            onChange={(v) => set({ project: v })}
            size="sm"
            className="min-w-[170px]"
            placeholder="All projects"
            searchPlaceholder="Search projects"
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
          />
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Status</span>
          <select
            value={filters.status}
            onChange={(e) => set({ status: e.target.value })}
            className={selectClass("sm", "min-w-[130px]")}
          >
            <option value="">Any status</option>
            {DOMAIN_TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Assigned from</span>
          <DateInput value={filters.from} max={filters.to || undefined} onChange={(iso: string) => set({ from: iso })} className={dateClass("sm")} />
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">To</span>
          <DateInput value={filters.to} min={filters.from || undefined} onChange={(iso: string) => set({ to: iso })} className={dateClass("sm")} />
        </label>

        {active && (
          <button
            onClick={() => onChange(EMPTY_TASK_FILTERS)}
            className="btn-ghost text-xs"
          >
            Clear
          </button>
        )}
      </div>

      {/* Only once a filter is on: otherwise it is just restating the list
          length back at someone who can see it. */}
      {active && (
        <p className="text-xs text-ink-500 mt-3 pt-3 border-t border-ink-100">
          Showing <strong className="text-ink-900">{matched}</strong> of{" "}
          {tasks.length} task{tasks.length === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
