"use client";

import Link from "next/link";
import {
  Users2,
  ArrowRight,
  AlertTriangle,
  Calendar,
  FolderKanban,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useTasks } from "@/lib/tasks-store";
import { useAccounts, useMyFirstName } from "@/lib/account-store";
import { firstNameOf, type Task } from "@/lib/mock";
import { ROLE_LABELS } from "@/lib/role";
import { useProjects } from "@/lib/projects-store";

export default function TeamPage() {
  const me = useMyFirstName();
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { accounts } = useAccounts();

  // Projects I run as a Coordinator — those are the ones whose team I
  // care about on this page.
  const myProjects = projects.filter((p) => p.coordinators.includes(me));
  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const teamTasks = tasks.filter((t) => myProjectIds.has(t.projectId));

  // Anyone with any per-project role on those projects OR who has a task
  // assigned counts as "my team", minus me.
  const teamFirstNames = new Set(
    [
      ...myProjects.flatMap((p) => [
        ...p.leads,
        ...p.coordinators,
        ...p.developers,
        ...p.bds,
      ]),
      ...teamTasks.flatMap((t) => t.assignees),
    ].filter((n) => n !== me),
  );
  const teamPeople = accounts.filter(
    (a) => a.active && teamFirstNames.has(firstNameOf(a.name)),
  );

  function tasksFor(person: string): Task[] {
    return teamTasks.filter(
      (t) => t.assignees.includes(person) && t.status !== "Done",
    );
  }
  function overdueFor(person: string): number {
    return tasksFor(person).filter((t) => !!t.overdueDays).length;
  }

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">My team</h1>
          <p className="text-sm text-ink-500 mt-1">
            {teamPeople.length}{" "}
            {teamPeople.length === 1 ? "person" : "people"} across{" "}
            {myProjects.length} project
            {myProjects.length === 1 ? "" : "s"} you're running.
          </p>
        </header>

        {myProjects.length > 0 && (
          <section className="card p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FolderKanban size={16} className="text-brand-blue" />
              <h2 className="font-heading text-base font-semibold">
                Projects you coordinate
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {myProjects.map((p) => {
                const open = tasks.filter(
                  (t) => t.projectId === p.id && t.status !== "Done",
                ).length;
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="border border-ink-200 rounded-card p-3 hover:bg-ink-50 group"
                  >
                    <div className="text-sm font-medium text-ink-900 truncate group-hover:text-brand-blue">
                      {p.name}
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      {open} open · {p.progress}%
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {teamPeople.length === 0 ? (
          <div className="card p-10 text-center">
            <Users2 size={32} className="mx-auto text-ink-400 mb-3" />
            <h2 className="font-heading text-lg font-semibold mb-1">
              No team yet
            </h2>
            <p className="text-sm text-ink-500 max-w-sm mx-auto">
              When you assign someone to a task on a project you coordinate,
              they show up here with their open work and how they're tracking.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamPeople.map((r) => {
              const person = firstNameOf(r.name);
              const open = tasksFor(person);
              const overdue = overdueFor(person);
              return (
                <div key={r.id} className="card p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-brand-blue text-white grid place-items-center font-heading font-medium">
                      {r.name
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading font-semibold text-base">
                        {r.name}
                      </h3>
                      <p className="text-xs text-ink-500">
                        {ROLE_LABELS[r.role]} · {r.email}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3 text-center">
                    <Stat label="Open" value={open.length} />
                    <Stat
                      label="Overdue"
                      value={overdue}
                      tone={overdue > 0 ? "red" : "default"}
                    />
                  </div>
                  {open.length > 0 ? (
                    <ul className="space-y-1.5 mb-3">
                      {open.slice(0, 3).map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          {t.overdueDays && (
                            <AlertTriangle
                              size={11}
                              className="text-brand-redText shrink-0"
                            />
                          )}
                          <span className="flex-1 truncate text-ink-700">
                            {t.title}
                          </span>
                          <span className="text-ink-400 inline-flex items-center gap-1 shrink-0">
                            <Calendar size={10} />
                            {new Date(t.targetDate).toLocaleDateString(
                              "en-IN",
                              { day: "numeric", month: "short" },
                            )}
                          </span>
                        </li>
                      ))}
                      {open.length > 3 && (
                        <li className="text-xs text-ink-400 italic">
                          +{open.length - 3} more
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-xs text-ink-400 italic mb-3">
                      No open tasks right now.
                    </p>
                  )}
                  <Link
                    href="/resources"
                    className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1"
                  >
                    Open in Resources <ArrowRight size={11} />
                  </Link>
                </div>
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
