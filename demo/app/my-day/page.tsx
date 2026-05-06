"use client";

import {
  CalendarClock,
  AlertTriangle,
  Star,
  Lock,
  Plus,
  Download,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { StatCard } from "@/components/StatCard";
import { TaskCard } from "@/components/TaskCard";
import {
  CURRENT_USER,
  USER_USER,
  RECENT_ACTIVITY,
  type Task,
} from "@/lib/mock";
import { useRole } from "@/lib/role";
import { useTasks } from "@/lib/tasks-store";

const TODAY = "2026-05-05";
const isOverdue = (d: string) => d < TODAY;
const isDueToday = (d: string) => d === TODAY;
const PRIO_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 } as const;

export default function MyDayPage() {
  const [role] = useRole();
  if (role === "User") return <UserMyDay />;
  return <ManagerMyDay />;
}

function ManagerMyDay() {
  const { tasks } = useTasks();
  const myTasks = tasks.filter(
    (t) => t.assignees.includes("Manasi") && t.status !== "Done",
  );

  const dueToday = myTasks.filter((t) => isDueToday(t.targetDate));
  const overdue = myTasks.filter((t) => isOverdue(t.targetDate));
  const importantMine = myTasks.filter((t) => t.important);
  const blockedTeam = tasks.filter(
    (t) => t.team === CURRENT_USER.team && t.status === "Blocked",
  );

  const myDay = myTasks
    .filter((t) => t.targetDate <= TODAY)
    .sort((a, b) => {
      const aOver = isOverdue(a.targetDate);
      const bOver = isOverdue(b.targetDate);
      if (aOver !== bOver) return aOver ? -1 : 1;
      return PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
    });

  const overdueNoRemark = tasks.filter(
    (t) =>
      t.team === CURRENT_USER.team &&
      t.overdueDays &&
      t.overdueDays >= 1 &&
      t.status !== "Done",
  );

  return (
    <>
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">
            Good morning, {CURRENT_USER.firstName}
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Tuesday, 5 May 2026 ·{" "}
            <span className="text-ink-700">{CURRENT_USER.team}</span>
          </p>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
          <StatCard
            label="Blocked — team"
            value={blockedTeam.length}
            Icon={Lock}
            variant="red"
            hint="across teams I manage"
          />
        </section>

        <div className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 space-y-6">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-lg font-semibold">My Day</h2>
                <span className="text-xs text-ink-500">
                  {myDay.length} task{myDay.length === 1 ? "" : "s"} · sorted by
                  urgency
                </span>
              </div>
              <div className="space-y-2">
                {myDay.length === 0 ? (
                  <EmptyState />
                ) : (
                  myDay.map((t) => <TaskCard key={t.id} task={t} />)
                )}
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-lg font-semibold">
                  Team needs attention
                </h2>
                <span className="text-xs text-ink-500">
                  Things that won't unblock themselves
                </span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Bucket
                  title="Blocked by team"
                  tasks={blockedTeam}
                  emptyText="No blockers."
                />
                <Bucket
                  title="Overdue, no remark"
                  tasks={overdueNoRemark}
                  emptyText="Nothing rotting."
                />
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold mb-3">
                Recent activity
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
                <a
                  href="/team-board"
                  className="btn-primary w-full justify-start"
                >
                  <Plus size={16} className="mr-2" /> Plan a task
                </a>
                <button className="btn-ghost w-full justify-start border border-ink-200">
                  <Download size={16} className="mr-2" /> Export Excel
                </button>
                <a
                  href="/team-board"
                  className="btn-ghost w-full justify-start border border-ink-200"
                >
                  Open team board <ArrowRight size={14} className="ml-2" />
                </a>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function UserMyDay() {
  const { tasks } = useTasks();
  const myTasks = tasks.filter(
    (t) => t.assignees.includes("Sanjana") && t.status !== "Done",
  );
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
    <>
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">
            Good morning, {USER_USER.firstName}
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Tuesday, 5 May 2026 ·{" "}
            <span className="text-ink-700">{USER_USER.team}</span>
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
                  Click any pill or button on a card — no menus, no drawers
                </span>
              </div>
              <div className="space-y-2">
                {myDay.length === 0 ? (
                  <EmptyState />
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
              <ul className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-brand-blue text-white grid place-items-center text-[10px] font-heading font-medium shrink-0">
                    M
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink-700">
                      <span className="font-medium text-ink-900">Manasi</span>{" "}
                      assigned you to{" "}
                      <span className="text-ink-900">Bulk select bug</span>
                    </p>
                    <span className="text-xs text-ink-400">10m ago</span>
                  </div>
                </li>
                <li className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-brand-yellow text-white grid place-items-center text-[10px] font-heading font-medium shrink-0">
                    M
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink-700">
                      <span className="font-medium text-ink-900">Manasi</span>{" "}
                      marked your task Important
                    </p>
                    <span className="text-xs text-ink-400">2h ago</span>
                  </div>
                </li>
              </ul>
            </div>

            <div className="card p-5">
              <h2 className="font-heading text-lg font-semibold mb-3">
                Quick actions
              </h2>
              <div className="space-y-2">
                <a
                  href="/my-tasks"
                  className="btn-primary w-full justify-start"
                >
                  Open My Tasks <ArrowRight size={14} className="ml-2" />
                </a>
                <a
                  href="/team-board"
                  className="btn-ghost w-full justify-start border border-ink-200"
                >
                  Browse team boards <ArrowRight size={14} className="ml-2" />
                </a>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function Bucket({
  title,
  tasks,
  emptyText,
}: {
  title: string;
  tasks: Task[];
  emptyText: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-3">
        {title}{" "}
        <span className="text-ink-400 font-medium normal-case">
          ({tasks.length})
        </span>
      </h3>
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-xs text-ink-400 italic">{emptyText}</p>
        ) : (
          tasks.slice(0, 3).map((t) => <TaskCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-10 text-center">
      <Sparkles size={28} className="mx-auto text-brand-yellow mb-2" />
      <p className="text-sm font-medium text-ink-700">Inbox zero.</p>
      <p className="text-xs text-ink-500">Nothing on your plate today.</p>
    </div>
  );
}
