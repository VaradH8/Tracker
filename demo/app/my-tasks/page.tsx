"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";
import { ForkableTasks } from "@/components/ForkableTasks";
import {
  isoWeekRange,
  taskInRange,
  todayISO,
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

const FOCUS_KEY = "tracker-mytasks-focus";

/** Which slice of the calendar the board is showing. */
type RangeMode = "all" | "this" | "last" | "custom";

/** "15 – 21 Sep" — the actual days behind "This week", so the label says
 *  something concrete instead of an ISO week number nobody counts in. */
function formatRange(from: string, to: string): string {
  const fmt = (iso: string, withMonth: boolean) =>
    new Date(iso + "T00:00:00").toLocaleDateString(
      "en-IN",
      withMonth ? { day: "numeric", month: "short" } : { day: "numeric" },
    );
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${fmt(from, !sameMonth)} – ${fmt(to, true)}`;
}

/** Focus = what needs attention now: due today, overdue, or in progress. */
function inFocus(t: Task): boolean {
  if (t.status === "Done") return false;
  // An undated task has no deadline pressure — only its status can pull
  // it into focus.
  return (
    t.status === "In Progress" ||
    (!!t.targetDate && t.targetDate <= todayISO())
  );
}

export default function MyTasksPage() {
  const [role] = useRole();
  const { tasks } = useTasks();
  const [focus, setFocus] = useState(true);
  const [rangeMode, setRangeMode] = useState<RangeMode>("this");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (localStorage.getItem(FOCUS_KEY) === "all") setFocus(false);
  }, []);

  function setFocusMode(f: boolean) {
    setFocus(f);
    localStorage.setItem(FOCUS_KEY, f ? "focus" : "all");
  }

  const me = useMyFirstName();
  const mine = tasks.filter((t) => t.assignees.includes(me));

  const thisWeekRange = useMemo(() => isoWeekRange(0), []);
  const lastWeekRange = useMemo(() => isoWeekRange(1), []);

  // A half-filled custom range reads as open-ended rather than as "no
  // results" — pick a start with no end and you get everything from then on.
  const range = useMemo(() => {
    // Unbounded: every task the person is on, dated or not. taskInRange
    // already places an undated open task in any window reaching today.
    if (rangeMode === "all") return { from: "0000-01-01", to: "9999-12-31" };
    if (rangeMode === "this") return thisWeekRange;
    if (rangeMode === "last") return lastWeekRange;
    return {
      from: customFrom || "0000-01-01",
      to: customTo || "9999-12-31",
    };
  }, [rangeMode, customFrom, customTo, thisWeekRange, lastWeekRange]);

  // The window shows work dated inside it plus anything unfinished that
  // carried forward into it (see taskInRange).
  const inWindow = mine.filter((t) => taskInRange(t, range.from, range.to));
  // Focus means "what needs attention now". That only reads sensibly
  // against the current week; applied to a window the user chose, it hid
  // everything not due today and made a custom range look empty.
  const focusApplies = rangeMode === "this";
  const shown = focus && focusApplies ? inWindow.filter(inFocus) : inWindow;

  return (
    <AppShell>
      <div className="max-w-[1500px] mx-auto px-6 py-8">
        <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-heading text-2xl font-semibold">My Tasks</h1>
            <p className="text-sm text-ink-500 mt-1">
              {focus && focusApplies
                ? "Focused on what needs attention today — due, overdue, in progress."
                : rangeMode === "all"
                  ? "Every task you're on, across all projects, grouped by status."
                  : "Your tasks in this window, grouped by status."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value as RangeMode)}
              title="Filter by date range"
              className="text-sm rounded border border-ink-200 px-2 py-1.5 bg-white"
            >
              <option value="all">All tasks</option>
              <option value="this">
                This week ({formatRange(thisWeekRange.from, thisWeekRange.to)})
              </option>
              <option value="last">
                Last week ({formatRange(lastWeekRange.from, lastWeekRange.to)})
              </option>
              <option value="custom">Custom dates</option>
            </select>
            {rangeMode === "custom" && (
              <div className="inline-flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="From date"
                  className="text-sm rounded border border-ink-200 px-2 py-1.5 bg-white"
                />
                <span className="text-xs text-ink-500">to</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="To date"
                  className="text-sm rounded border border-ink-200 px-2 py-1.5 bg-white"
                />
              </div>
            )}
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

        <ForkableTasks />
      </div>
    </AppShell>
  );
}
