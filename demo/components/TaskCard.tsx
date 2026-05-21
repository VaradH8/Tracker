"use client";

import Link from "next/link";
import type { Task } from "@/lib/mock";
import { projectById } from "@/lib/mock";
import { useTaskDrawer } from "./TaskDrawerProvider";
import { useTasks } from "@/lib/tasks-store";
import { useRole } from "@/lib/role";
import { useToast } from "./Toast";
import { useBlockDialog } from "./BlockDialogProvider";
import {
  AssigneePicker,
  DateField,
  ImportantToggle,
  PriorityPicker,
  QuickActions,
  StatusPicker,
} from "./InlineActions";

const ROLE_PERSON: Record<string, string> = {
  Admin: "Manasi",
  Coordinator: "Manasi",
  BusinessDeveloper: "Rohit",
  Developer: "Sanjana",
};

export function TaskCard({
  task,
  hideProject = false,
}: {
  task: Task;
  hideProject?: boolean;
}) {
  const drawer = useTaskDrawer();
  const store = useTasks();
  const [role] = useRole();
  const toast = useToast();
  const blockDialog = useBlockDialog();

  function reassign(name: string) {
    const wasAssigned = task.assignees.includes(name);
    store.toggleAssignee(task.id, name);
    toast.show(
      wasAssigned
        ? `${name} removed from “${task.title}”.`
        : `${name} assigned to “${task.title}”.`,
      "success",
      { label: "Undo", onClick: () => store.toggleAssignee(task.id, name) },
    );
  }

  const me = ROLE_PERSON[role] ?? "Manasi";
  const isAssignee = task.assignees.includes(me);
  const canEdit = role === "Admin" || role === "Coordinator";
  const overdue = !!task.overdueDays && task.status !== "Done";
  const project = projectById(task.projectId);

  const cls = [
    "card p-3 text-left w-full transition-shadow hover:shadow-md",
    task.important ? "bg-brand-yellowBg border-brand-yellowBorder" : "bg-white",
    overdue ? "border-l-[3px] border-l-brand-red" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <PriorityPicker
          value={task.priority}
          onChange={(p) => store.setPriority(task.id, p)}
          readOnly={!canEdit}
        />
        {!hideProject && project && (
          <Link
            href={`/projects/${project.id}`}
            title={`Open ${project.name}`}
            className="pill-grey truncate max-w-[160px] hover:bg-ink-200 hover:text-ink-900 transition-colors"
          >
            {project.name}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ImportantToggle
            value={task.important}
            onChange={() => store.toggleImportant(task.id)}
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
          onToggle={reassign}
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
          onBlock={() => blockDialog.requestBlock(task.id)}
          readOnly={!isAssignee && !canEdit}
        />
        <QuickActions
          task={task}
          isAssignee={isAssignee}
          canEdit={canEdit}
          onStatus={(s) => store.setStatus(task.id, s)}
          onBlock={() => blockDialog.requestBlock(task.id)}
        />
      </div>
    </div>
  );
}
