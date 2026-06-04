"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";
import { useTasks } from "@/lib/tasks-store";
import { useRole } from "@/lib/role";
import { meName } from "@/lib/access";
import { TODAY_ISO, type Task } from "@/lib/mock";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const [role] = useRole();
  const me = meName(role);
  const { tasks } = useTasks();

  const todayParts = TODAY_ISO.split("-").map(Number);
  const [year, setYear] = useState(todayParts[0]);
  const [month, setMonth] = useState(todayParts[1] - 1);
  const [selected, setSelected] = useState<string>(TODAY_ISO);

  // Admin + Coordinator see everything; everyone else sees their own work.
  const visibleTasks = useMemo(() => {
    if (role === "Admin" || role === "Coordinator") return tasks;
    return tasks.filter(
      (t) => t.assignees.includes(me) || t.responsible === me,
    );
  }, [role, me, tasks]);

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of visibleTasks) {
      const arr = m.get(t.targetDate) ?? [];
      arr.push(t);
      m.set(t.targetDate, arr);
    }
    return m;
  }, [visibleTasks]);

  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: { iso: string; day: number; isOther: boolean }[] = [];

  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const py = month === 0 ? year - 1 : year;
    const pm = month === 0 ? 11 : month - 1;
    cells.push({ iso: toISO(py, pm, d), day: d, isOther: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: toISO(year, month, d), day: d, isOther: false });
  }
  while (cells.length < 42) {
    const d = cells.length - (startWeekday + daysInMonth) + 1;
    const ny = month === 11 ? year + 1 : year;
    const nm = month === 11 ? 0 : month + 1;
    cells.push({ iso: toISO(ny, nm, d), day: d, isOther: true });
  }

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  }
  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  }
  function gotoToday() {
    setYear(todayParts[0]);
    setMonth(todayParts[1] - 1);
    setSelected(TODAY_ISO);
  }

  const selectedTasks = byDate.get(selected) ?? [];

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Calendar</h1>
            <p className="text-sm text-ink-500 mt-1">
              {role === "Admin" || role === "Coordinator"
                ? "All tasks across the org, by target date."
                : "Tasks you're on or running, by target date."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-2 rounded hover:bg-ink-100"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="font-heading font-semibold text-base min-w-[170px] text-center">
              {MONTHS[month]} {year}
            </div>
            <button
              onClick={nextMonth}
              className="p-2 rounded hover:bg-ink-100"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={gotoToday}
              className="btn-ghost border border-ink-200 ml-2 text-sm py-1 px-3"
            >
              Today
            </button>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <section className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-ink-200 bg-ink-50">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="text-xs font-semibold text-ink-500 uppercase tracking-wide text-center py-2"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((c) => {
                const list = byDate.get(c.iso) ?? [];
                const isToday = c.iso === TODAY_ISO;
                const isSelected = c.iso === selected;
                const isOverdueDay = c.iso < TODAY_ISO;
                return (
                  <button
                    key={c.iso}
                    onClick={() => setSelected(c.iso)}
                    className={`min-h-[92px] border-r border-b border-ink-100 p-2 text-left flex flex-col gap-1 transition-colors ${
                      isSelected ? "bg-brand-blueBg" : "hover:bg-ink-50"
                    } ${c.isOther ? "bg-ink-50/40" : ""}`}
                  >
                    <span
                      className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                        isToday
                          ? "bg-brand-blue text-white"
                          : c.isOther
                            ? "text-ink-400"
                            : "text-ink-700"
                      }`}
                    >
                      {c.day}
                    </span>
                    {list.length > 0 && (
                      <ul className="space-y-0.5">
                        {list.slice(0, 2).map((t) => {
                          const overdue = isOverdueDay && t.status !== "Done";
                          return (
                            <li
                              key={t.id}
                              className={`text-[11px] truncate px-1 rounded ${
                                t.status === "Done"
                                  ? "text-ink-400 line-through"
                                  : overdue
                                    ? "text-brand-redText bg-brand-redBg"
                                    : "text-ink-700 bg-brand-blueBg"
                              }`}
                            >
                              {t.title}
                            </li>
                          );
                        })}
                        {list.length > 2 && (
                          <li className="text-[11px] text-ink-500 px-1">
                            +{list.length - 2} more
                          </li>
                        )}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <aside>
            <div className="card p-5 lg:sticky lg:top-2">
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock size={16} className="text-brand-blue" />
                <h2 className="font-heading text-base font-semibold">
                  {new Date(selected + "T00:00:00").toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    weekday: "long",
                  })}
                </h2>
                <span className="text-xs text-ink-500 ml-auto">
                  {selectedTasks.length} task
                  {selectedTasks.length === 1 ? "" : "s"}
                </span>
              </div>
              {selectedTasks.length === 0 ? (
                <EmptyState
                  Icon={CalendarClock}
                  title="Nothing on this day"
                  message="No tasks have this target date."
                  compact
                />
              ) : (
                <div className="space-y-2">
                  {selectedTasks.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
