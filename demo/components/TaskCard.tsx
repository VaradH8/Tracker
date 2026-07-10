"use client";

import Link from "next/link";
import type { Task } from "@/lib/mock";
import { useProjects } from "@/lib/projects-store";
import { useTaskDrawer } from "./TaskDrawerProvider";
import { useTasks } from "@/lib/tasks-store";
import { useRole } from "@/lib/role";
import { useMyFirstName } from "@/lib/account-store";
import { useToast } from "./Toast";
import { useBlockDialog } from "./BlockDialogProvider";
import { useNotifications } from "@/lib/notifications-store";
import type { Status } from "@/lib/mock";
import {
  AssigneePicker,
  DateField,
  ImportantToggle,
  PriorityPicker,
  QuickActions,
  StatusPicker,
  TimerControls,
} from "./InlineActions";

export function TaskCard({
  task,
  hideProject = false,
}: {
  task: Task;
  hideProject?: boolean;
}) {
  const drawer = useTaskDrawer();
  const store = useTasks();
  const { projectById } = useProjects();
  const [role] = useRole();
  const me = useMyFirstName();
  const toast = useToast();
  const blockDialog = useBlockDialog();
  const { notify } = useNotifications();

  function reassign(name: string) {
    const wasAssigned = task.assignees.includes(name);
    store.toggleAssignee(task.id, name);
    if (!wasAssigned) {
      // Notify the new assignee — skip if it's the actor themselves
      // (no point emailing yourself).
      if (name !== me) {
        notify({
          recipient: name,
          kind: "assigned",
          title: "Assigned to a task",
          body: task.title,
          taskId: task.id,
        });
      }
      // Self-assign: tell the lead (Person Responsible) someone on their
      // team picked it up.
      if (name === me && task.responsible && task.responsible !== me) {
        notify({
          recipient: task.responsible,
          kind: "assigned",
          title: `${me} self-assigned to a task`,
          body: task.title,
          taskId: task.id,
        });
      }
    }
    toast.show(
      wasAssigned
        ? `${name} removed from “${task.title}”.`
        : name === me && task.responsible && task.responsible !== me
          ? `You picked up “${task.title}”. ${task.responsible} notified.`
          : `${name} assigned to “${task.title}”.`,
      "success",
      { label: "Undo", onClick: () => store.toggleAssignee(task.id, name) },
    );
  }

  function changeStatus(next: Status) {
    const prev = task.status;
    if (next === prev) return;
    store.setStatus(task.id, next);
    toast.show(`“${task.title}” → ${next}`, "success", {
      label: "Undo",
      onClick: () => store.setStatus(task.id, prev),
    });
  }

  const isAssignee = task.assignees.includes(me);
  const canEdit = role === "Admin" || role === "Coordinator";
  const overdue = !!task.overdueDays && task.status !== "Done";
  const project = projectById(task.projectId);
  // Cumulative logged time = the task's server-tracked actualHours. This
  // is incremented atomically every time a timer interval is closed, so
  // it's the reliable source for the timer's running total (summing the
  // client-side time-entry list went stale across start/stop cycles).
  const loggedHours = task.actualHours ?? 0;
  const canRunTimer = isAssignee;

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
        className="text-left w-full min-w-0 break-words text-sm text-ink-900 leading-snug mb-3 hover:text-brand-blue"
      >
        {task.title}
      </button>

      <div className="flex items-center justify-between gap-x-2 gap-y-1.5 mb-2 flex-wrap">
        <AssigneePicker
          selected={task.assignees}
          onToggle={reassign}
          readOnly={!canEdit}
        />
        <div className="flex items-center gap-2 flex-wrap">
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

      <div className="flex items-center justify-between gap-x-2 gap-y-1.5 pt-2 border-t border-ink-100 flex-wrap">
        <StatusPicker
          value={task.status}
          onChange={changeStatus}
          onBlock={() => blockDialog.requestBlock(task.id)}
          readOnly={!isAssignee && !canEdit}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <TimerControls
            task={task}
            canRun={canRunTimer}
            loggedHours={loggedHours}
            active={store.activeTimer}
            onStart={() => {
              void store.startTimer(task.id);
              toast.show(`Timer started on "${task.title}".`);
            }}
            onStop={() => {
              void store.stopTimer(task.id);
              toast.show(`Timer paused — resume any time with Start.`);
            }}
            onDone={() => {
              void store.doneTimer(task.id);
              toast.show(`"${task.title}" marked Done.`);
            }}
          />
          <QuickActions
            task={task}
            isAssignee={isAssignee}
            canEdit={canEdit}
            onStatus={changeStatus}
            onBlock={() => blockDialog.requestBlock(task.id)}
          />
        </div>
      </div>
    </div>
  );
}
