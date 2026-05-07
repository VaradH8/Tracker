"use client";

import Link from "next/link";
import {
  Plus,
  Search,
  ArrowRight,
  Users as UsersIcon,
  Clock,
  Calendar,
} from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  CLIENTS,
  PROJECTS,
  clientById,
  projectStatusPill,
  type ProjectStatus,
} from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { canManageProjects } from "@/lib/role";
import { useRole } from "@/lib/role";

const FILTERS: { id: ProjectStatus | "All"; label: string }[] = [
  { id: "All", label: "All" },
  { id: "Active", label: "Active" },
  { id: "Discovery", label: "Discovery" },
  { id: "On Hold", label: "On Hold" },
  { id: "Delivered", label: "Delivered" },
];

export default function ProjectsPage() {
  const [filter, setFilter] = useState<ProjectStatus | "All">("All");
  const [query, setQuery] = useState("");
  const [role] = useRole();
  const { tasks } = useTasks();

  const visible = PROJECTS.filter(
    (p) => filter === "All" || p.status === filter,
  ).filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      clientById(p.clientId)?.name.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Projects</h1>
            <p className="text-sm text-ink-500 mt-1">
              {PROJECTS.length} projects across {CLIENTS.length} clients
            </p>
          </div>
          {canManageProjects(role) && (
            <button className="btn-primary">
              <Plus size={16} className="mr-1.5" /> New project
            </button>
          )}
        </div>

        <div className="card p-3 mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects or clients…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={
                filter === f.id
                  ? "pill-blue cursor-pointer"
                  : "pill-grey cursor-pointer hover:bg-ink-200"
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="card p-10 text-center text-ink-500">
            No projects match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((p) => {
              const client = clientById(p.clientId);
              const projectTasks = tasks.filter((t) => t.projectId === p.id);
              const open = projectTasks.filter(
                (t) => t.status !== "Done",
              ).length;
              const overdue = projectTasks.filter(
                (t) => !!t.overdueDays && t.status !== "Done",
              ).length;
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="card p-5 hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className={projectStatusPill(p.status)}>
                      {p.status}
                    </span>
                    <HealthDot health={p.health} />
                  </div>
                  <h3 className="font-heading text-base font-semibold leading-snug mb-1 group-hover:text-brand-blue">
                    {p.name}
                  </h3>
                  <p className="text-xs text-ink-500 mb-4">
                    {client?.name} · {client?.industry}
                  </p>

                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                      <span>Progress</span>
                      <span className="font-medium text-ink-700">
                        {p.progress}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-blue"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <Stat
                      label="Tasks"
                      value={projectTasks.length}
                    />
                    <Stat label="Open" value={open} />
                    <Stat
                      label="Overdue"
                      value={overdue}
                      tone={overdue > 0 ? "red" : "default"}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-ink-500 pt-3 border-t border-ink-100">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon size={11} />
                        {p.coordinator}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {p.loggedHours}/{p.budgetHours}h
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={11} />
                      {new Date(p.targetDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                      <ArrowRight
                        size={12}
                        className="text-brand-blue ml-1 group-hover:translate-x-0.5 transition-transform"
                      />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "red";
}) {
  return (
    <div className="bg-ink-50 rounded p-2">
      <div
        className={`font-heading text-lg font-semibold ${tone === "red" ? "text-brand-redText" : "text-ink-900"}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-ink-500 uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function HealthDot({ health }: { health: "green" | "yellow" | "red" }) {
  const cls =
    health === "green"
      ? "bg-brand-green"
      : health === "yellow"
        ? "bg-brand-yellow"
        : "bg-brand-red";
  const label =
    health === "green"
      ? "On track"
      : health === "yellow"
        ? "Watch"
        : "At risk";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-500" title={label}>
      <span className={`w-2 h-2 rounded-full ${cls}`} />
      {label}
    </span>
  );
}
