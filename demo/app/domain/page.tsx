"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDomain } from "@/lib/domain-store";
import { DOMAIN_ROLE_LABELS, logWindowLabel } from "@/lib/domain";
import { DomainTaskList, type DomainTask } from "@/components/DomainTaskList";

export default function DomainDashboard() {
  const { current } = useDomain();
  if (!current) return null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">
          Hi {current.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Signed in as {DOMAIN_ROLE_LABELS[current.role]}.
        </p>
      </header>

      {current.role === "Admin" && <AdminHome />}
      {current.role === "Lead" && <LeadHome />}
      {(current.role === "TeamLead" || current.role === "Actionee") && (
        <MyTasksHome />
      )}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <h2 className="font-heading text-base font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function AdminHome() {
  const [counts, setCounts] = useState({ users: 0, projects: 0, openTasks: 0 });
  useEffect(() => {
    async function load() {
      const [u, p, t] = await Promise.all([
        fetch("/api/domain/users").then((r) => (r.ok ? r.json() : { users: [] })),
        fetch("/api/domain/projects").then((r) => (r.ok ? r.json() : { projects: [] })),
        fetch("/api/domain/tasks").then((r) => (r.ok ? r.json() : { tasks: [] })),
      ]);
      setCounts({
        users: u.users?.length ?? 0,
        projects: p.projects?.length ?? 0,
        openTasks: (t.tasks ?? []).filter((x: DomainTask) => x.status !== "Done").length,
      });
    }
    void load();
  }, []);

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <Stat label="People" value={counts.users} href="/domain/users" />
      <Stat label="Projects" value={counts.projects} href="/domain/projects" />
      <Stat label="Open tasks" value={counts.openTasks} href="/domain/projects" />
      <div className="sm:col-span-3">
        <Card title="Allocation">
          <p className="text-sm text-ink-600 mb-3">
            See who has capacity to take on work.
          </p>
          <Link href="/domain/availability" className="btn-primary inline-flex">
            Open resource availability
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card p-5 hover:shadow-md transition">
      <div className="text-xs text-ink-500 font-medium">{label}</div>
      <div className="font-heading text-3xl font-semibold mt-1">{value}</div>
    </Link>
  );
}

function LeadHome() {
  return (
    <div className="grid gap-4">
      <Card title="Your projects">
        <p className="text-sm text-ink-600 mb-3">
          Create and own projects; your Team Leads assign the tasks under them.
        </p>
        <Link href="/domain/projects" className="btn-primary inline-flex">
          Go to projects
        </Link>
      </Card>
      <Card title="Log your work">
        <p className="text-sm text-ink-600 mb-3">
          Record what you did today — only between {logWindowLabel()}.
        </p>
        <Link href="/domain/worklog" className="btn-ghost border border-ink-200 inline-flex">
          Open work log
        </Link>
      </Card>
    </div>
  );
}

function MyTasksHome() {
  const [tasks, setTasks] = useState<DomainTask[] | null>(null);

  async function load() {
    const res = await fetch("/api/domain/tasks?mine=true", { cache: "no-store" });
    if (res.ok) setTasks((await res.json()).tasks ?? []);
    else setTasks([]);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">My tasks</h2>
        <Link href="/domain/worklog" className="btn-primary inline-flex">
          Log work
        </Link>
      </div>
      {tasks === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <DomainTaskList tasks={tasks} canManage={false} onChanged={load} />
      )}
    </div>
  );
}