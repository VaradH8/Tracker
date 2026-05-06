"use client";

import type { Task } from "@/lib/mock";
import { useTaskDrawer } from "./TaskDrawerProvider";
import { useTasks } from "@/lib/tasks-store";
import { useRole } from "@/lib/role";
import {
  AssigneePicker,
  DateField,
  ImportantToggle,
  PriorityPicker,
  QuickActions,
  StatusPicker,
} from "./InlineActions";

const ROLE_PERSON: Record<string, string> = {
  Manager: "Manasi",
  User: "Sanjana",
  Admin: "Manasi",
};

export function TaskCard({ task }: { task: Task }) {
  const drawer = useTaskDrawer();
  const store = useTasks();
  const [role] = useRole();

  const me = ROLE_PERSON[role];
  const isAssignee = task.assignees.includes(me);
  const canEdit = role === "Admin" || role === "Manager";
  const overdue = !!task.overdueDays && task.status !== "Done";

  const cls = [
    "card p-3 text-left w-full transition-shadow hover:shadow-md",
    task.important ? "bg-brand-yellowBg border-brand-yellowBorder" : "bg-white",
    overdue ? "border-l-[3px] border-l-brand-red" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className="flex items-center gap-1.5 mb-2">
        <PriorityPicker
          value={task.priority}
          onChange={(p) => store.setPriority(task.id, p)}
          readOnly={!canEdit}
        />
        <span className="pill-grey">{task.project}</span>
        <div className="ml-auto flex items-center gap-1">
          <ImportantToggle
            value={task.important}
            onChange={(v) => store.toggleImportant(task.id)}
            readOnly={!canEdit}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => drawer.open(task.id)}
        className="text-left w-full text-sm text-ink-900 leading-snug mb-3 hover:text-brand-blue"
      >
        {task.title}
      </button>

      <div className="flex items-center justify-between gap-2 mb-2">
        <AssigneePicker
          selected={task.assignees}
          onToggle={(name) => store.toggleAssignee(task.id, name)}
          readOnly={!canEdit}
        />
        <div className="flex items-center gap-2">
          {overdue && (
            <span className="pill-red text-[10px] py-0.5">
              Overdue {task.overdueDays}d
            </span>
          )}
          <DateField
            value={task.targetDate}
            onChange={(d) => store.setTargetDate(task.id, d)}
            readOnly={!canEdit}
            label="Target date"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-ink-100">
        <StatusPicker
          value={task.status}
          onChange={(s) => store.setStatus(task.id, s)}
          readOnly={!isAssignee && !canEdit}
        />
        <QuickActions
          task={task}
          isAssignee={isAssignee}
          canEdit={canEdit}
          onStatus={(s) => store.setStatus(task.id, s)}
        />
      </div>
    </div>
  );
}
