"use client";

import { Trash2 } from "lucide-react";
import { DOMAIN_TASK_STATUSES } from "@/lib/domain";
import { ConfirmButton } from "./ConfirmButton";

export type DomainTask = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  estimatedHours: number | null;
  projectId: number;
  projectName: string;
  assignee: string | null;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
};

export type Person = { id: string; name: string; role: string };

function statusCls(status: string): string {
  if (status === "Done") return "bg-brand-greenBg text-brand-greenText";
  if (status === "In Progress") return "bg-brand-blueBg text-brand-blue";
  return "bg-ink-100 text-ink-600";
}

export function DomainTaskList({
  tasks,
  canManage,
  people = [],
  hideProject = false,
  onChanged,
}: {
  tasks: DomainTask[];
  /** Managers (Admin/Lead/TeamLead) get reassign + delete controls. */
  canManage: boolean;
  people?: Person[];
  hideProject?: boolean;
  onChanged: () => void;
}) {
  const assignable = people.filter((p) =>
    ["Actionee", "TeamLead", "SME"].includes(p.role),
  );

  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/domain/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onChanged();
  }

  async function remove(id: number) {
    const res = await fetch(`/api/domain/tasks/${id}`, { method: "DELETE" });
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
        <li key={t.id} className="card p-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <div className="text-sm font-medium text-ink-900 break-words">
              {t.title}
            </div>
            <div className="text-xs text-ink-500 mt-0.5">
              {!hideProject && <span>{t.projectName} · </span>}
              {t.assignee ? `Assigned to ${t.assignee}` : "Unassigned"}
              {t.estimatedHours != null ? ` · ${t.estimatedHours}h` : ""}
              {t.startDate || t.targetDate
                ? ` · ${t.startDate ?? "?"} → ${t.targetDate ?? "?"}`
                : ""}
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(t.status)}`}>
            {t.status}
          </span>
          <select
            value={t.status}
            onChange={(e) => patch(t.id, { status: e.target.value })}
            className="text-xs rounded border border-ink-200 px-2 py-1 bg-white"
            aria-label="Change status"
          >
            {DOMAIN_TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {canManage && (
            <>
              {assignable.length > 0 && (
                <select
                  value={t.assigneeId ?? ""}
                  onChange={(e) =>
                    patch(t.id, { assigneeId: e.target.value || null })
                  }
                  className="text-xs rounded border border-ink-200 px-2 py-1 bg-white max-w-[140px]"
                  aria-label="Reassign"
                >
                  <option value="">Unassigned</option>
                  {assignable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <ConfirmButton
                onConfirm={() => remove(t.id)}
                title="Delete task"
                className="p-1 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
              >
                <Trash2 size={14} />
              </ConfirmButton>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}