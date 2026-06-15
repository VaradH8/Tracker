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
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { statusPill, todayISO, type Task } from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useProjects } from "@/lib/projects-store";
import { useTaskDrawer } from "@/components/TaskDrawerProvider";

type Filter = "active" | "overdue" | "important" | "done";

const TITLES: Record<Filter, string> = {
  active: "Active Tasks Across All Projects",
  overdue: "Overdue Tasks Across All Projects",
  important: "⭐ Important Tasks Across All Projects",
  done: "Tasks Done This Week",
};

export default function OrgDashboardPage() {
  const { tasks } = useTasks();
  const { projects, projectById } = useProjects();
  const drawer = useTaskDrawer();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("important");

  const active = tasks.filter((t) => t.status !== "Done");
  const overdue = tasks.filter(
    (t) => !!t.overdueDays && t.status !== "Done",
  );
  const important = tasks.filter((t) => t.important);
  // "Done This Week" = the last 7 days, not the entire backlog of done.
  // Approve / completion timestamps aren't stored on the client, so we
  // use targetDate as the proxy — same window we filter on everywhere.
  const sevenDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const todayStr = todayISO();
  const doneThisWeek = tasks.filter(
    (t) =>
      t.status === "Done" &&
      t.targetDate >= sevenDaysAgo &&
      t.targetDate <= todayStr,
  );

  const filtered: Task[] =
    filter === "active"
      ? active
      : filter === "overdue"
        ? overdue
        : filter === "important"
          ? important
          : doneThisWeek;

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-ink-500 mt-1">
            Org-wide health ·{" "}
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            ·{" "}
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
              {filtered.length} {filtered.length === 1 ? "task" : "tasks"} ·
              click a row to open
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
                    <th className="py-2 pr-4">Project</th>
                    <th className="py-2 pr-4">Accountable</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Due</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const project = projectById(t.projectId);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => drawer.open(t.id)}
                        className="border-b border-ink-100 hover:bg-ink-50 cursor-pointer"
                      >
                        <td className="py-3 pr-4 max-w-[320px]">
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
                        <td className="py-3 pr-4 text-ink-700 max-w-[200px] truncate">
                          {project?.name ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-ink-700">
                          {t.assignees.join(", ") || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={statusPill(t.status)}>
                            {t.status}
                          </span>
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
                            Open{" "}
                            <ArrowRight
                              size={12}
                              className="inline ml-0.5"
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-heading text-lg font-semibold mb-4">
            Project health
          </h2>
          {projects.length === 0 ? (
            <p className="text-sm text-ink-500 italic py-4">
              No projects yet. Head to{" "}
              <button
                onClick={() => router.push("/projects")}
                className="text-brand-blue hover:underline"
              >
                Projects → New project
              </button>{" "}
              to add one.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {projects.map((p) => (
                <li
                  key={p.id}
                  onClick={() => router.push(`/projects/${p.id}`)}
                  className="py-3 flex items-center gap-3 cursor-pointer hover:bg-ink-50 -mx-3 px-3 rounded"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      p.health === "green"
                        ? "bg-brand-green"
                        : p.health === "yellow"
                          ? "bg-brand-yellow"
                          : "bg-brand-red"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-900 truncate">
                      {p.name}
                    </div>
                    <div className="text-xs text-ink-500">
                      {p.coordinators[0] ?? p.leads[0] ?? "—"} ·{" "}
                      {p.progress}% · {p.loggedHours}/{p.budgetHours}h
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-ink-400 shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
