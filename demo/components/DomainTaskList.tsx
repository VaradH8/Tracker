"use client";

import { DOMAIN_TASK_STATUSES } from "@/lib/domain";

export type DomainTask = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  targetDate: string | null;
  projectId: number;
  projectName: string;
  assignee: string | null;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
};

function statusCls(status: string): string {
  if (status === "Done") return "bg-brand-greenBg text-brand-greenText";
  if (status === "In Progress") return "bg-brand-blueBg text-brand-blue";
  return "bg-ink-100 text-ink-600";
}

export function DomainTaskList({
  tasks,
  canManage,
  hideProject = false,
  onChanged,
}: {
  tasks: DomainTask[];
  /** Managers (Admin/Lead/TeamLead) — reserved for future reassign UI. */
  canManage: boolean;
  hideProject?: boolean;
  onChanged: () => void;
}) {
  async function setStatus(id: number, status: string) {
    const res = await fetch(`/api/domain/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) onChanged();
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-ink-400 italic py-4 text-center">
        No tasks yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li
          key={t.id}
          className="card p-3 flex items-center gap-3 flex-wrap"
        >
          <div className="flex-1 min-w-[180px]">
            <div className="text-sm font-medium text-ink-900">{t.title}</div>
            <div className="text-xs text-ink-500 mt-0.5">
              {!hideProject && <span>{t.projectName} · </span>}
              {t.assignee ? `Assigned to ${t.assignee}` : "Unassigned"}
              {t.targetDate ? ` · due ${t.targetDate}` : ""}
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(t.status)}`}>
            {t.status}
          </span>
          <select
            value={t.status}
            onChange={(e) => setStatus(t.id, e.target.value)}
            className="text-xs rounded border border-ink-200 px-2 py-1 bg-white"
            aria-label="Change status"
          >
            {DOMAIN_TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}