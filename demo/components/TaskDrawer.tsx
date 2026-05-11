"use client";

import {
  X,
  Calendar,
  Clock,
  Users,
  UserCheck,
  MessageSquare,
  History,
} from "lucide-react";
import { useState } from "react";
import {
  AssigneePicker,
  DateField,
  ImportantToggle,
  PriorityPicker,
  QuickActions,
  StatusPicker,
} from "./InlineActions";
import { useTasks } from "@/lib/tasks-store";
import { useRole } from "@/lib/role";
import { projectById } from "@/lib/mock";

const ROLE_PERSON: Record<string, string> = {
  Admin: "Manasi",
  Coordinator: "Manasi",
  BusinessDeveloper: "Rohit",
  Developer: "Sanjana",
};

const AVATAR_COLORS = [
  "bg-brand-blue",
  "bg-brand-red",
  "bg-brand-green",
  "bg-brand-yellow",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function TaskDrawer({
  taskId,
  onClose,
}: {
  taskId: number;
  onClose: () => void;
}) {
  const store = useTasks();
  const [role] = useRole();
  const [newRemark, setNewRemark] = useState("");
  const task = store.byId(taskId);

  if (!task) return null;

  const me = ROLE_PERSON[role] ?? "Manasi";
  const isAssignee = task.assignees.includes(me);
  const canEdit = role === "Admin" || role === "Coordinator";
  const project = projectById(task.projectId);

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-ink-900/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside className="w-full max-w-[480px] bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-200 flex items-center gap-3">
          <PriorityPicker
            value={task.priority}
            onChange={(p) => store.setPriority(task.id, p)}
            readOnly={!canEdit}
          />
          {project && (
            <span
              className="pill-grey truncate max-w-[180px]"
              title={project.name}
            >
              {project.name}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ImportantToggle
              value={task.important}
              onChange={() => store.toggleImportant(task.id)}
              readOnly={!canEdit}
            />
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-ink-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <h2 className="font-heading text-lg font-semibold leading-tight">
            {task.title}
          </h2>

          {(canEdit || isAssignee) && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-card bg-ink-50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500">Status</span>
                <StatusPicker
                  value={task.status}
                  onChange={(s) => store.setStatus(task.id, s)}
                />
              </div>
              <QuickActions
                task={task}
                isAssignee={isAssignee}
                canEdit={canEdit}
                onStatus={(s) => store.setStatus(task.id, s)}
              />
            </div>
          )}

          {canEdit && (
            <Field label="Description">
              <textarea
                defaultValue={task.description ?? ""}
                placeholder="What needs to be done?"
                rows={3}
                className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
              />
            </Field>
          )}

          {!canEdit && task.description && (
            <Field label="Description">
              <p className="text-sm text-ink-700 leading-relaxed">
                {task.description}
              </p>
            </Field>
          )}

          <Field
            label="Person Responsible"
            icon={<UserCheck size={14} />}
            hint="The person who assigned this task"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-brand-blue text-white grid place-items-center text-[10px] font-heading font-medium shrink-0">
                {(task.responsible ?? "?")[0]}
              </div>
              <span className="text-sm text-ink-900 font-medium">
                {task.responsible ?? "Unassigned"}
              </span>
            </div>
          </Field>

          <Field
            label="Person Accountable"
            icon={<Users size={14} />}
            hint="The person(s) doing the work"
          >
            <div className="flex items-center gap-2">
              <AssigneePicker
                selected={task.assignees}
                onToggle={(name) => store.toggleAssignee(task.id, name)}
                readOnly={!canEdit}
              />
              <span className="text-xs text-ink-500">
                {task.assignees.join(", ") || "Unassigned"}
              </span>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Target date" icon={<Calendar size={14} />}>
              <DateField
                value={task.targetDate}
                onChange={(d) => store.setTargetDate(task.id, d)}
                readOnly={!canEdit}
                label="Target date"
              />
            </Field>
            <Field label="Estimated" icon={<Clock size={14} />}>
              <span className="text-sm text-ink-700">
                {task.estimatedHours != null
                  ? `${task.estimatedHours} hrs`
                  : "—"}
              </span>
            </Field>
          </div>

          <section>
            <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2 flex items-center gap-2">
              <MessageSquare size={12} /> Remarks
              <span className="font-medium normal-case text-ink-400">
                ({task.remarks?.length ?? 0})
              </span>
            </h3>
            <ul className="space-y-3 mb-3">
              {(task.remarks ?? []).map((r) => {
                const idx = (task.remarks ?? []).indexOf(r);
                return (
                  <li key={r.id} className="flex gap-2.5 text-sm">
                    <div
                      className={`w-7 h-7 rounded-full text-white grid place-items-center text-[10px] font-heading font-medium shrink-0 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}
                    >
                      {initials(r.author)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-ink-900">
                          {r.author}
                        </span>
                        <span className="text-xs text-ink-400">{r.when}</span>
                      </div>
                      <p className="text-ink-700">{r.body}</p>
                    </div>
                  </li>
                );
              })}
              {(task.remarks ?? []).length === 0 && (
                <li className="text-xs text-ink-400 italic">
                  No remarks yet.
                </li>
              )}
            </ul>
            {(canEdit || isAssignee) && (
              <div className="border border-ink-200 rounded-card p-2">
                <textarea
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                  rows={2}
                  placeholder="Add a remark…  (use @ to mention)"
                  className="w-full text-sm focus:outline-none resize-none"
                />
                <div className="flex justify-end pt-1.5 border-t border-ink-100 mt-1.5">
                  <button
                    onClick={() => setNewRemark("")}
                    disabled={!newRemark.trim()}
                    className="btn-primary text-xs py-1 px-3 disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              </div>
            )}
          </section>

          <details>
            <summary className="text-xs font-semibold text-ink-700 uppercase tracking-wide cursor-pointer flex items-center gap-2">
              <History size={12} /> Audit timeline
            </summary>
            <ul className="mt-2 space-y-1.5 text-xs text-ink-500 pl-5">
              <li>
                <span className="font-medium text-ink-900">Manasi</span>{" "}
                marked Important · 2h ago
              </li>
              <li>
                <span className="font-medium text-ink-900">Abhishek</span>{" "}
                added remark · 1h ago
              </li>
              <li>
                <span className="font-medium text-ink-900">Manasi</span>{" "}
                created task · 2 days ago
              </li>
            </ul>
          </details>
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-700 uppercase tracking-wide mb-1">
        {icon}
        {label}
      </label>
      {hint && <p className="text-[11px] text-ink-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}
