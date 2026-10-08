"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users2, ArrowRight, FolderKanban } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useTasks } from "@/lib/tasks-store";
import { labelOf, useAccounts, useMyFirstName } from "@/lib/account-store";
import type { Task } from "@/lib/mock";
import { ROLE_LABELS, useRole } from "@/lib/role";
import { useProjects } from "@/lib/projects-store";

export default function TeamPage() {
  const me = useMyFirstName();
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { accounts } = useAccounts();
  const [role] = useRole();
  const isLead = role === "Lead";

  // A Lead's team is the people who report to them. The server already
  // limits a Lead's performance list (and their tasks) to that team.
  const [reportIds, setReportIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isLead) return;
    let live = true;
    fetch("/api/performance/people", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { people?: { id: string }[] } | null) => {
        if (live) setReportIds(new Set((d?.people ?? []).map((p) => p.id)));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isLead]);

  // A Lead: the projects their team has work on (their task list is
  // already just the team's). A Co-ordinator: the projects they run.
  const myProjects = isLead
    ? projects.filter((p) => tasks.some((t) => t.projectId === p.id))
    : projects.filter((p) => p.coordinators.includes(me));
  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const teamTasks = tasks.filter((t) => myProjectIds.has(t.projectId));

  // A Co-ordinator's team: anyone with any per-project role on those
  // projects OR who has a task assigned there, minus me.
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
    (a) => a.active && (isLead ? reportIds.has(a.id) : teamFirstNames.has(labelOf(a))),
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
            {teamPeople.length === 1 ? "person" : "people"}
            {isLead ? " reporting to you, across " : " across "}
            {myProjects.length} project
            {myProjects.length === 1 ? "" : "s"}
            {isLead ? "." : " you're running."}
          </p>
        </header>

        {myProjects.length > 0 && (
          <section className="card p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FolderKanban size={16} className="text-brand-blue" />
              <h2 className="font-heading text-base font-semibold">
                {isLead ? "Projects your team is on" : "Projects you coordinate"}
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
              {isLead
                ? "People whose Reporting Manager is you show up here with their open work and how they're tracking."
                : "When you assign someone to a task on a project you coordinate, they show up here with their open work and how they're tracking."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamPeople.map((r) => {
              const person = labelOf(r);
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
