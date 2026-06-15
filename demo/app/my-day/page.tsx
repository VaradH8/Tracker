"use client";

import { useState } from "react";
import {
  CalendarClock,
  AlertTriangle,
  Star,
  Lock,
  Plus,
  Download,
  ArrowRight,
  Sparkles,
  Activity,
  Truck,
  UserMinus,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { TaskCard } from "@/components/TaskCard";
import {
  RECENT_ACTIVITY,
  RESOURCES,
  daysSince,
  type Task,
} from "@/lib/mock";
import { useProjects } from "@/lib/projects-store";
import { useRole } from "@/lib/role";
import { useMyFirstName } from "@/lib/account-store";
import { useTasks } from "@/lib/tasks-store";
import { useToast } from "@/components/Toast";
import { toCsv, downloadCsv } from "@/lib/csv";

const TODAY = "2026-05-06";
const isOverdue = (d: string) => d < TODAY;
const isDueToday = (d: string) => d === TODAY;
const PRIO_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 } as const;

const REASSIGN_PEOPLE = RESOURCES.filter(
  (r) => r.status === "Active" && !r.isAdmin,
).map((r) => r.name.split(" ")[0]);

export default function MyDayPage() {
  const [role] = useRole();
  if (role === "Developer") return <DeveloperMyDay />;
  return <CoordinatorMyDay />;
}

/* ------------------------------------------------------------------ */
/* Co-ordinator — a TEAM view: what does my team need from me today.  */
/* ------------------------------------------------------------------ */

function CoordinatorMyDay() {
  const { tasks } = useTasks();
  const { projects, projectById } = useProjects();
  const toast = useToast();
  const me = useMyFirstName();
  const [idleDays, setIdleDays] = useState(3);

  // "My team" = tasks on projects this co-ordinator runs.
  const myProjectIds = new Set(
    projects
      .filter((p) => p.coordinators.includes(me))
      .map((p) => p.id),
  );
  const teamTasks = tasks.filter((t) => myProjectIds.has(t.projectId));

  const deliveries = teamTasks
    .filter((t) => isDueToday(t.targetDate) && t.status !== "Done")
    .sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]);

  const overdue = teamTasks
    .filter((t) => isOverdue(t.targetDate) && t.status !== "Done")
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  const blocked = teamTasks.filter((t) => t.status === "Blocked");

  const idle = RESOURCES.filter(
    (r) =>
      r.status === "Active" &&
      !r.isAdmin &&
      daysSince(r.lastStatusChange) >= idleDays,
  );

  function exportTeam() {
    const csv = toCsv(
      ["Task", "Project", "Status", "Priority", "Accountable", "Target date"],
      teamTasks.map((t) => [
        t.title,
        projectById(t.projectId)?.name ?? "",
        t.status,
        t.priority,
        t.assignees.join("; "),
        t.targetDate,
      ]),
    );
    downloadCsv("team-tasks.csv", csv);
    toast.show(`Exported ${teamTasks.length} team tasks to CSV.`);
  }

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">
            Good morning, {me || "there"}
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Wednesday, 6 May 2026 · Co-ordinator · what your team needs today
          </p>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Due Today"
            value={deliveries.length}
            Icon={CalendarClock}
            variant="blue"
            hint="team deliveries"
          />
          <StatCard
            label="Overdue"
            value={overdue.length}
            Icon={AlertTriangle}
            variant="red"
            hint="across your projects"
          />
          <StatCard
            label="Blocked"
            value={blocked.length}
            Icon={Lock}
            variant="red"
            hint="need unblocking"
          />
          <StatCard
            label="Idle resources"
            value={idle.length}
            Icon={UserMinus}
            variant="yellow"
            hint={`no update in ${idleDays}+ days`}
          />
        </section>

        <div className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 space-y-6">
            <PlainTaskSection
              title="Today's deliveries"
              Icon={Truck}
              tasks={deliveries}
              emptyText="Nothing due today across your projects."
            />

            <BulkTaskSection
              title="Overdue"
              Icon={AlertTriangle}
              tasks={overdue}
              emptyText="Nothing overdue — your team is current."
            />

            <BulkTaskSection
              title="Blocked — needs unblocking today"
              Icon={Lock}
              tasks={blocked}
              emptyText="No blocked tasks. Nothing waiting on you."
            />
          </section>

          <aside className="space-y-6">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
                  <UserMinus size={18} className="text-brand-yellow" /> Idle
                  resources
                </h2>
                <select
                  value={idleDays}
                  onChange={(e) => setIdleDays(Number(e.target.value))}
                  className="text-xs rounded border border-ink-200 px-1.5 py-1"
                  title="Idle threshold"
                >
                  <option value={2}>2+ days</option>
                  <option value={3}>3+ days</option>
                  <option value={5}>5+ days</option>
                  <option value={7}>7+ days</option>
                </select>
              </div>
              {idle.length === 0 ? (
                <p className="text-sm text-ink-500 italic">
                  Everyone's posted an update recently.
                </p>
              ) : (
                <ul className="space-y-2">
                  {idle.map((r) => (
                    <li key={r.id}>
                      <Link
                        href="/resources?filter=flagged"
                        className="flex items-center gap-3 p-2 -mx-2 rounded hover:bg-ink-50"
                      >
                        <div className="w-8 h-8 rounded-full bg-brand-yellow text-white grid place-items-center text-[10px] font-heading font-medium shrink-0">
                          {r.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink-900 font-medium truncate">
                            {r.name}
                          </div>
                          <div className="text-xs text-ink-500">
                            {r.designation}
                          </div>
                        </div>
                        <span className="pill-yellow text-[10px] py-0 shrink-0">
                          idle {daysSince(r.lastStatusChange)}d
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold mb-3 flex items-center gap-2">
                <Activity size={18} className="text-brand-blue" /> Recent
                activity
              </h2>
              <ul className="space-y-3 text-sm">
                {RECENT_ACTIVITY.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-ink-100 grid place-items-center text-[10px] font-heading font-medium text-ink-700 shrink-0">
                      {a.who[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink-700">
                        <span className="font-medium text-ink-900">
                          {a.who}
                        </span>{" "}
                        {a.what}{" "}
                        <span className="text-ink-900">{a.target}</span>
                      </p>
                      <span className="text-xs text-ink-400">{a.when}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold mb-3">
                Quick actions
              </h2>
              <div className="space-y-2">
                <Link
                  href="/projects"
                  className="btn-primary w-full justify-start"
                >
                  <Plus size={16} className="mr-2" /> Plan a task
                </Link>
                <button
                  onClick={exportTeam}
                  className="btn-ghost w-full justify-start border border-ink-200"
                >
                  <Download size={16} className="mr-2" /> Export team tasks
                </button>
                <Link
                  href="/my-tasks"
                  className="btn-ghost w-full justify-start border border-ink-200"
                >
                  Your own tasks <ArrowRight size={14} className="ml-2" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

/* A non-selectable titled list of task cards. */
function PlainTaskSection({
  title,
  Icon,
  tasks,
  emptyText,
}: {
  title: string;
  Icon: typeof Truck;
  tasks: Task[];
  emptyText: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-brand-blue" />
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <span className="text-xs text-ink-500">({tasks.length})</span>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-500 italic">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/* A titled list with multi-select + bulk reassign / bulk due-date. */
function BulkTaskSection({
  title,
  Icon,
  tasks,
  emptyText,
}: {
  title: string;
  Icon: typeof Truck;
  tasks: Task[];
  emptyText: string;
}) {
  const { bulkReassign, bulkSetTargetDate } = useTasks();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const ids = [...selected].filter((id) => tasks.some((t) => t.id === id));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
  }

  function doReassign(name: string) {
    bulkReassign(ids, name);
    toast.show(`${ids.length} task(s) reassigned to ${name}.`);
    clear();
  }

  function doDate(date: string) {
    bulkSetTargetDate(ids, date);
    toast.show(`${ids.length} task(s) moved to ${date}.`);
    clear();
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-brand-red" />
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <span className="text-xs text-ink-500">({tasks.length})</span>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-ink-500 italic">{emptyText}</p>
      ) : (
        <>
          {ids.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-card bg-brand-blueBg">
              <span className="text-xs font-medium text-brand-blue px-1">
                {ids.length} selected
              </span>
              <select
                value=""
                onChange={(e) => e.target.value && doReassign(e.target.value)}
                className="text-xs rounded border border-ink-200 px-2 py-1 bg-white"
              >
                <option value="">Reassign to…</option>
                {REASSIGN_PEOPLE.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="date"
                onChange={(e) => e.target.value && doDate(e.target.value)}
                className="text-xs rounded border border-ink-200 px-2 py-1 bg-white"
                title="Set due date for selected"
              />
              <button
                onClick={clear}
                className="text-xs text-ink-500 hover:text-ink-900 px-1"
              >
                Clear
              </button>
            </div>
          )}
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="mt-4 accent-brand-blue shrink-0"
                  aria-label={`Select ${t.title}`}
                />
                <div className="flex-1 min-w-0">
                  <TaskCard task={t} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Developer — a personal day: my tasks, sorted by urgency.           */
/* ------------------------------------------------------------------ */

function prettyAuditAction(action: string): string {
  switch (action) {
    case "task.status_change":
      return "moved";
    case "task.mark_important":
      return "marked Important on";
    case "task.reassign":
      return "reassigned";
    case "task.responsible_change":
      return "changed who's responsible on";
    case "task.create":
      return "created";
    case "task.approve":
      return "approved";
    default:
      return action;
  }
}

function DeveloperMyDay() {
  const { tasks, auditLog } = useTasks();
  const me = useMyFirstName();
  const myTasks = tasks.filter(
    (t) => t.assignees.includes(me) && t.status !== "Done",
  );
  // Recent activity that mentions tasks the developer is on.
  const myTaskTitles = new Set(tasks.filter((t) => t.assignees.includes(me)).map((t) => t.title));
  const myActivity = auditLog
    .filter((a) => a.taskTitle && myTaskTitles.has(a.taskTitle))
    .slice(0, 6);
  const dueToday = myTasks.filter((t) => isDueToday(t.targetDate));
  const overdue = myTasks.filter((t) => isOverdue(t.targetDate));
  const importantMine = myTasks.filter((t) => t.important);

  const myDay = myTasks
    .filter((t) => t.targetDate <= TODAY)
    .sort((a, b) => {
      const aOver = isOverdue(a.targetDate);
      const bOver = isOverdue(b.targetDate);
      if (aOver !== bOver) return aOver ? -1 : 1;
      return PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
    });

  const upNext = myTasks
    .filter((t) => t.targetDate > TODAY)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))
    .slice(0, 5);

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">
            Good morning, {me || "there"}
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Wednesday, 6 May 2026 · Developer
          </p>
        </header>

        <section className="grid grid-cols-3 gap-4 mb-8 max-w-2xl">
          <StatCard
            label="Due Today"
            value={dueToday.length}
            Icon={CalendarClock}
            variant="blue"
          />
          <StatCard
            label="Overdue"
            value={overdue.length}
            Icon={AlertTriangle}
            variant="red"
          />
          <StatCard
            label="Important — mine"
            value={importantMine.length}
            Icon={Star}
            variant="yellow"
          />
        </section>

        <div className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 space-y-6">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-lg font-semibold">My Day</h2>
                <span className="text-xs text-ink-500">
                  Click any pill or button on a card — no menus needed
                </span>
              </div>
              <div className="space-y-2">
                {myDay.length === 0 ? (
                  <InboxZero />
                ) : (
                  myDay.map((t) => <TaskCard key={t.id} task={t} />)
                )}
              </div>
            </div>

            {upNext.length > 0 && (
              <div className="card p-5">
                <h2 className="font-heading text-lg font-semibold mb-4">
                  Up Next
                </h2>
                <div className="space-y-2">
                  {upNext.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold mb-3">
                Recent updates
              </h2>
              {myActivity.length === 0 ? (
                <p className="text-sm text-ink-500 italic">
                  Nothing's changed on your tasks recently.
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {myActivity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-ink-100 grid place-items-center text-[10px] font-heading font-medium text-ink-700 shrink-0">
                        {a.actor[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink-700">
                          <span className="font-medium text-ink-900">
                            {a.actor}
                          </span>{" "}
                          {prettyAuditAction(a.action)}
                          {a.taskTitle && (
                            <>
                              {" "}
                              <span className="text-ink-900">
                                {a.taskTitle}
                              </span>
                            </>
                          )}
                        </p>
                        <span className="text-xs text-ink-400">{a.when}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold mb-3">
                Quick actions
              </h2>
              <div className="space-y-2">
                <Link
                  href="/my-tasks"
                  className="btn-primary w-full justify-start"
                >
                  Open My Tasks <ArrowRight size={14} className="ml-2" />
                </Link>
                <Link
                  href="/projects"
                  className="btn-ghost w-full justify-start border border-ink-200"
                >
                  Browse projects <ArrowRight size={14} className="ml-2" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function InboxZero() {
  return (
    <div className="py-10 text-center">
      <Sparkles size={28} className="mx-auto text-brand-yellow mb-2" />
      <p className="text-sm font-medium text-ink-700">Inbox zero.</p>
      <p className="text-xs text-ink-500">Nothing on your plate today.</p>
    </div>
  );
}
