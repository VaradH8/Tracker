"use client";

import { useState } from "react";
import {
  ListTodo,
  AlertTriangle,
  Star,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { StatCard } from "@/components/StatCard";
import { TEAM_SUMMARIES, statusPill, type Task } from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useTaskDrawer } from "@/components/TaskDrawerProvider";

type Filter = "active" | "overdue" | "important" | "done";

const TITLES: Record<Filter, string> = {
  active: "Active Tasks Across All Teams",
  overdue: "Overdue Tasks Across All Teams",
  important: "⭐ Important Tasks Across All Teams",
  done: "Tasks Done This Week",
};

export default function OrgDashboardPage() {
  const { tasks } = useTasks();
  const drawer = useTaskDrawer();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("important");

  const active = tasks.filter((t) => t.status !== "Done");
  const overdue = tasks.filter(
    (t) => !!t.overdueDays && t.status !== "Done",
  );
  const important = tasks.filter((t) => t.important);
  const doneThisWeek = tasks.filter((t) => t.status === "Done");

  const filtered: Task[] =
    filter === "active"
      ? active
      : filter === "overdue"
        ? overdue
        : filter === "important"
          ? important
          : doneThisWeek;

  return (
    <>
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">
            Org Dashboard
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            Cross-team rollup · Wednesday, 6 May 2026 ·{" "}
            <span className="text-ink-700">click any card to drill down</span>
          </p>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Active Tasks"
            value={active.length}
            Icon={ListTodo}
            variant="blue"
            onClick={() => setFilter("active")}
            active={filter === "active"}
          />
          <StatCard
            label="Overdue"
            value={overdue.length}
            Icon={AlertTriangle}
            variant="red"
            onClick={() => setFilter("overdue")}
            active={filter === "overdue"}
          />
          <StatCard
            label="Important ⭐"
            value={important.length}
            Icon={Star}
            variant="yellow"
            onClick={() => setFilter("important")}
            active={filter === "important"}
          />
          <StatCard
            label="Done This Week"
            value={doneThisWeek.length}
            Icon={CheckCircle2}
            variant="green"
            onClick={() => setFilter("done")}
            active={filter === "done"}
          />
        </section>

        <section className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold">
              {TITLES[filter]}
            </h2>
            <span className="text-xs text-ink-500">
              {filtered.length}{" "}
              {filtered.length === 1 ? "task" : "tasks"} · click a row to open
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-ink-500 italic py-6 text-center">
              Nothing here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200">
                    <th className="py-2 pr-4">Task</th>
                    <th className="py-2 pr-4">Team / Project</th>
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Due</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => drawer.open(t.id)}
                      className="border-b border-ink-100 hover:bg-ink-50 cursor-pointer"
                    >
                      <td className="py-3 pr-4 max-w-[360px]">
                        <div className="flex items-center gap-2">
                          {t.important && (
                            <Star
                              size={12}
                              className="text-brand-yellow fill-brand-yellow shrink-0"
                            />
                          )}
                          <p className="text-ink-900 truncate">{t.title}</p>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-ink-700">
                        <div>{t.team}</div>
                        <div className="text-xs text-ink-500">{t.project}</div>
                      </td>
                      <td className="py-3 pr-4 text-ink-700">
                        {t.assignees.join(", ") || "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={statusPill(t.status)}>{t.status}</span>
                      </td>
                      <td className="py-3 pr-4 text-ink-700">
                        {new Date(t.targetDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                        {t.overdueDays && (
                          <span className="ml-2 pill-red text-[10px] py-0">
                            +{t.overdueDays}d
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            drawer.open(t.id);
                          }}
                          className="text-brand-blue hover:underline text-xs"
                        >
                          Open <ArrowRight size={12} className="inline ml-0.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-heading text-lg font-semibold mb-4">
            Per-Team Summary
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200">
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4">Manager</th>
                  <th className="py-2 pr-4 text-right">Active</th>
                  <th className="py-2 pr-4 text-right">Overdue</th>
                  <th className="py-2 pr-4 text-right">Important</th>
                  <th className="py-2 pr-4">Last activity</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {TEAM_SUMMARIES.map((t) => (
                  <tr
                    key={t.name}
                    onClick={() => router.push("/team-board")}
                    className="border-b border-ink-100 hover:bg-ink-50 cursor-pointer"
                  >
                    <td className="py-3 pr-4 font-medium text-ink-900">
                      {t.name}
                    </td>
                    <td className="py-3 pr-4 text-ink-700">{t.manager}</td>
                    <td className="py-3 pr-4 text-right text-ink-900 font-heading font-medium">
                      {t.active}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {t.overdue > 0 ? (
                        <span className="pill-red text-[10px] py-0">
                          {t.overdue}
                        </span>
                      ) : (
                        <span className="text-ink-400">0</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {t.important > 0 ? (
                        <span className="pill-yellow text-[10px] py-0">
                          {t.important}
                        </span>
                      ) : (
                        <span className="text-ink-400">0</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-ink-500">
                      {t.lastActivity}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/team-board");
                        }}
                        className="text-brand-blue hover:underline text-xs"
                      >
                        Open <ArrowRight size={12} className="inline ml-0.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
