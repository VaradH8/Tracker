"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";
import {
  CURRENT_WEEK,
  weekNumberOf,
  type Status,
  type Task,
} from "@/lib/mock";
import { useRole } from "@/lib/role";
import { useMyFirstName } from "@/lib/account-store";
import { useTasks } from "@/lib/tasks-store";

const COLUMNS: { id: Status; title: string; accent: string }[] = [
  { id: "To Do", title: "To Do", accent: "bg-ink-400" },
  { id: "In Progress", title: "In Progress", accent: "bg-brand-blue" },
  { id: "Blocked", title: "Blocked", accent: "bg-brand-red" },
  { id: "In review", title: "In review", accent: "bg-brand-yellow" },
  { id: "Done", title: "Done", accent: "bg-brand-green" },
];

const TODAY = "2026-05-06";
const FOCUS_KEY = "tracker-mytasks-focus";

/** Focus = what needs attention now: due today, overdue, or in progress. */
function inFocus(t: Task): boolean {
  if (t.status === "Done") return false;
  return t.status === "In Progress" || t.targetDate <= TODAY;
}

export default function MyTasksPage() {
  const [role] = useRole();
  const { tasks } = useTasks();
  const [focus, setFocus] = useState(true);
  const [weekFilter, setWeekFilter] = useState<"all" | number>("all");

  useEffect(() => {
    if (localStorage.getItem(FOCUS_KEY) === "all") setFocus(false);
  }, []);

  function setFocusMode(f: boolean) {
    setFocus(f);
    localStorage.setItem(FOCUS_KEY, f ? "focus" : "all");
  }

  const me = useMyFirstName();
  const mine = tasks.filter((t) => t.assignees.includes(me));

  // Build the week dropdown from the weeks the user's tasks actually
  // touch, so the Excel-style "Week 19/20/21..." picker only ever shows
  // weeks that mean something.
  const weeksWithMine = useMemo(() => {
    const set = new Set<number>();
    for (const t of mine) set.add(weekNumberOf(t.targetDate));
    set.add(CURRENT_WEEK);
    return Array.from(set).sort((a, b) => a - b);
  }, [mine]);

  const afterWeek =
    weekFilter === "all"
      ? mine
      : mine.filter((t) => weekNumberOf(t.targetDate) === weekFilter);
  const shown = focus ? afterWeek.filter(inFocus) : afterWeek;

  return (
    <AppShell>
      <div className="max-w-[1500px] mx-auto px-6 py-8">
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-heading text-2xl font-semibold">My Tasks</h1>
            <p className="text-sm text-ink-500 mt-1">
              {focus
                ? "Focused on what needs attention today — due, overdue, in progress."
                : "Your full backlog across all projects, grouped by status."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={weekFilter === "all" ? "all" : String(weekFilter)}
              onChange={(e) =>
                setWeekFilter(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              title="Filter by ISO week number"
              className="text-sm rounded border border-ink-200 px-2 py-1.5 bg-white"
            >
              <option value="all">All weeks</option>
              <option value={CURRENT_WEEK}>This week (W{CURRENT_WEEK})</option>
              <option value={CURRENT_WEEK - 1}>
                Last week (W{CURRENT_WEEK - 1})
              </option>
              <option value={CURRENT_WEEK + 1}>
                Next week (W{CURRENT_WEEK + 1})
              </option>
              {weeksWithMine
                .filter(
                  (w) =>
                    w !== CURRENT_WEEK &&
                    w !== CURRENT_WEEK - 1 &&
                    w !== CURRENT_WEEK + 1,
                )
                .map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
            </select>
            <div className="inline-flex rounded-card border border-ink-200 overflow-hidden text-sm">
              <button
                onClick={() => setFocusMode(true)}
                className={
                  focus
                    ? "px-3 py-1.5 bg-brand-blue text-white font-medium"
                    : "px-3 py-1.5 text-ink-700 hover:bg-ink-100"
                }
              >
                Focus
              </button>
              <button
                onClick={() => setFocusMode(false)}
                className={
                  !focus
                    ? "px-3 py-1.5 bg-brand-blue text-white font-medium"
                    : "px-3 py-1.5 text-ink-700 hover:bg-ink-100"
                }
              >
                Show all
              </button>
            </div>
          </div>
        </header>

        {mine.length === 0 ? (
          <EmptyState
            Icon={CheckSquare}
            title="No tasks assigned to you"
            message="When a co-ordinator assigns you a task it lands here, grouped by status."
          />
        ) : shown.length === 0 ? (
          <EmptyState
            Icon={Sparkles}
            title="Nothing needs your attention right now"
            message="Nothing due, overdue, or in progress. Switch to Show all to see your full backlog."
            action={
              <button
                onClick={() => setFocusMode(false)}
                className="btn-ghost border border-ink-200"
              >
                Show all tasks
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {COLUMNS.map((col) => {
              const cards = shown.filter((t) => t.status === col.id);
              return (
                <div
                  key={col.id}
                  className="bg-ink-50 rounded-card p-3 min-h-[260px]"
                >
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                    <h2 className="font-heading text-sm font-semibold">
                      {col.title}
                    </h2>
                    <span className="text-xs text-ink-500">
                      {cards.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {cards.map((t) => (
                      <TaskCard key={t.id} task={t} />
                    ))}
                    {cards.length === 0 && (
                      <p className="text-xs text-ink-400 italic px-1">empty</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {role === "Developer" && mine.length > 0 && (
          <p className="text-xs text-ink-400 mt-6 italic text-center">
            Click any pill or button on a card to update status — no menus, no
            drawers needed.
          </p>
        )}
      </div>
    </AppShell>
  );
}
