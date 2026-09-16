"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FolderKanban,
  ListTodo,
  AlertTriangle,
  Lock,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useProjects } from "@/lib/projects-store";
import { useTasks } from "@/lib/tasks-store";
import { useAccounts } from "@/lib/account-store";
import { useRole } from "@/lib/role";
import {
  formatINR,
  todayISO,
  projectProgress,
  type Task,
} from "@/lib/mock";

const STATUSES = ["To Do", "In Progress", "Blocked", "In review", "Done"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

type Deal = {
  id: number;
  stage: string;
  estimatedValue: number;
  probability: number;
};

function daysAgo(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso + "T00:00:00").getTime()) / 86_400_000,
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export default function AnalyticsPage() {
  const [role] = useRole();
  const { projects, clients } = useProjects();
  const { tasks } = useTasks();
  const { accounts } = useAccounts();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leaves, setLeaves] = useState<
    { resourceName: string; start: string; end: string; approved: boolean }[]
  >([]);

  useEffect(() => {
    fetch("/api/pipeline", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { deals: [] }))
      .then((b) => setDeals(b.deals ?? []))
      .catch(() => null);
    fetch("/api/leaves", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { leaves: [] }))
      .then((b) => setLeaves(b.leaves ?? []))
      .catch(() => null);
  }, []);

  const stats = useMemo(() => {
    const today = todayISO();
    const openTasks = tasks.filter((t) => t.status !== "Done");
    const overdue = openTasks.filter((t) => !!t.overdueDays);
    const blocked = tasks.filter((t) => t.status === "Blocked");
    const activeProjects = projects.filter((p) => p.status === "Active");

    const weightedPipeline = deals
      .filter((d) => d.stage !== "Kicked off")
      .reduce((s, d) => s + (d.estimatedValue * d.probability) / 100, 0);

    return {
      today,
      openTasks,
      overdue,
      blocked,
      activeProjects,
      weightedPipeline,
    };
  }, [tasks, projects, accounts, deals]);

  // Projects at risk: red health, over budget, or past target and not delivered.
  const atRisk = useMemo(() => {
    return projects
      .map((p) => {
        const reasons: string[] = [];
        if (p.health === "red") reasons.push("At risk");
        if (p.budgetHours > 0 && p.loggedHours > p.budgetHours)
          reasons.push("Over budget");
        if (p.targetDate < stats.today && p.status !== "Delivered")
          reasons.push("Past deadline");
        return { p, reasons };
      })
      .filter((x) => x.reasons.length > 0);
  }, [projects, stats.today]);

  const overdueTasks = useMemo(
    () =>
      [...stats.overdue].sort(
        (a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0),
      ),
    [stats.overdue],
  );

  // Per-week hours, last 6 weeks (oldest → newest).

  const byStatus = useMemo(
    () => STATUSES.map((s) => ({ label: s, n: tasks.filter((t) => t.status === s).length })),
    [tasks],
  );
  const byPriority = useMemo(
    () =>
      PRIORITIES.map((p) => ({
        label: p,
        n: tasks.filter((t) => t.priority === p).length,
      })),
    [tasks],
  );
  const health = useMemo(
    () => ({
      green: projects.filter((p) => p.health === "green").length,
      yellow: projects.filter((p) => p.health === "yellow").length,
      red: projects.filter((p) => p.health === "red").length,
    }),
    [projects],
  );

  const topClients = useMemo(() => {
    const byClient = new Map<number, number>();
    for (const p of projects) {
      byClient.set(p.clientId, (byClient.get(p.clientId) ?? 0) + p.loggedHours);
    }
    return Array.from(byClient.entries())
      .map(([clientId, hours]) => ({
        name: clients.find((c) => c.id === clientId)?.name ?? "—",
        hours,
        projects: projects.filter((p) => p.clientId === clientId).length,
      }))
      .filter((c) => c.hours > 0)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 6);
  }, [projects, clients]);

  const pipelineByStage = useMemo(() => {
    const stages = ["Lead", "Quoted", "Won", "Kicked off"];
    return stages.map((s) => ({
      label: s,
      value: deals
        .filter((d) => d.stage === s)
        .reduce((sum, d) => sum + d.estimatedValue, 0),
    }));
  }, [deals]);

  const upcomingLeaves = useMemo(() => {
    const today = todayISO();
    const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    return leaves
      .filter((l) => l.approved && l.end >= today && l.start <= in14)
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [leaves]);

  if (role !== "Admin") {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="card p-8 text-center">
            <h1 className="font-heading text-xl font-semibold mb-2">Admins only</h1>
            <p className="text-sm text-ink-500">
              The analytics cockpit is restricted to admins.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Analytics</h1>
          <p className="text-sm text-ink-500 mt-1">
            Company-wide operational overview.
          </p>
        </header>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <StatCard
            label="Active projects"
            value={stats.activeProjects.length}
            Icon={FolderKanban}
            variant="blue"
            hint={`${projects.length} total`}
          />
          <StatCard
            label="Open tasks"
            value={stats.openTasks.length}
            Icon={ListTodo}
            variant="blue"
          />
          <StatCard
            label="Overdue"
            value={stats.overdue.length}
            Icon={AlertTriangle}
            variant="red"
          />
          <StatCard
            label="Blocked"
            value={stats.blocked.length}
            Icon={Lock}
            variant="yellow"
          />
          <StatCard
            label="Pipeline (weighted)"
            value={formatINR(stats.weightedPipeline)}
            Icon={TrendingUp}
            variant="green"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Delivery health */}
          <Section title="Project health">
            <Bars
              rows={[
                { label: "On track", n: health.green, cls: "bg-brand-green" },
                { label: "Watch", n: health.yellow, cls: "bg-brand-yellow" },
                { label: "At risk", n: health.red, cls: "bg-brand-red" },
              ]}
            />
          </Section>

          {/* Tasks by status */}
          <Section title="Tasks by status">
            <Bars rows={byStatus.map((s) => ({ label: s.label, n: s.n }))} />
          </Section>

          {/* Tasks by priority */}
          <Section title="Tasks by priority">
            <Bars rows={byPriority.map((s) => ({ label: s.label, n: s.n }))} />
          </Section>
        </div>

        {/* Projects at risk */}
        <Section title={`Projects at risk (${atRisk.length})`} className="mb-6">
          {atRisk.length === 0 ? (
            <Empty text="No projects flagged — all green." />
          ) : (
            <Table
              head={["Project", "Client", "Progress", "Hours", "Target", "Flags"]}
            >
              {atRisk.map(({ p, reasons }) => (
                <tr key={p.id} className="border-b border-ink-100">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/projects/${p.id}`}
                      className="text-ink-900 font-medium hover:text-brand-blue"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-ink-500">
                    {clients.find((c) => c.id === p.clientId)?.name ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-ink-700">
                    {projectProgress(p.id, tasks)}%
                  </td>
                  <td
                    className={`py-2 pr-4 ${
                      p.budgetHours > 0 && p.loggedHours > p.budgetHours
                        ? "text-brand-redText font-medium"
                        : "text-ink-700"
                    }`}
                  >
                    {p.loggedHours}/{p.budgetHours}h
                  </td>
                  <td className="py-2 pr-4 text-ink-700">{p.targetDate}</td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {reasons.map((r) => (
                        <span
                          key={r}
                          className="px-1.5 py-0.5 rounded-pill text-[10px] font-medium bg-brand-redBg text-brand-redText"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Overdue tasks */}
          <Section title={`Overdue tasks (${overdueTasks.length})`}>
            {overdueTasks.length === 0 ? (
              <Empty text="Nothing overdue. Nice." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {overdueTasks.slice(0, 12).map((t: Task) => (
                  <li key={t.id} className="py-2 flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate text-sm text-ink-900">
                      {t.title}
                    </span>
                    <span className="text-xs text-ink-500 shrink-0">
                      {t.assignees.join(", ") || "Unassigned"}
                    </span>
                    <span className="text-xs text-brand-redText font-medium shrink-0 w-16 text-right">
                      {t.overdueDays}d late
                    </span>
                  </li>
                ))}
                {overdueTasks.length > 12 && (
                  <li className="py-2 text-xs text-ink-400">
                    +{overdueTasks.length - 12} more
                  </li>
                )}
              </ul>
            )}
          </Section>

          {/* Top clients */}
          <Section title="Top clients by hours">
            {topClients.length === 0 ? (
              <Empty text="No logged hours yet." />
            ) : (
              <Bars
                rows={topClients.map((c) => ({
                  label: `${c.name} (${c.projects})`,
                  n: c.hours,
                  suffix: "h",
                }))}
              />
            )}
          </Section>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Pipeline */}
          <Section title="Pipeline by stage">
            {deals.length === 0 ? (
              <Empty text="No deals in the pipeline." />
            ) : (
              <ul className="space-y-2">
                {pipelineByStage.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-ink-600">{s.label}</span>
                    <span className="font-heading font-semibold text-ink-900">
                      {formatINR(s.value)}
                    </span>
                  </li>
                ))}
                <li className="pt-2 border-t border-ink-100 flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-ink-600">Weighted</span>
                  <span className="font-heading font-semibold text-brand-green">
                    {formatINR(stats.weightedPipeline)}
                  </span>
                </li>
              </ul>
            )}
          </Section>

          {/* Upcoming leaves */}
          <Section title="Upcoming leave (next 14 days)">
            {upcomingLeaves.length === 0 ? (
              <Empty text="Everyone's at the desk." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {upcomingLeaves.map((l, i) => (
                  <li key={i} className="py-2 flex items-center gap-2 text-sm">
                    <span className="flex-1 text-ink-900">{l.resourceName}</span>
                    <span className="text-xs text-ink-500">
                      {l.start === l.end ? l.start : `${l.start} → ${l.end}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <h2 className="font-heading text-base font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-ink-400 italic">{text}</p>;
}

function Bars({
  rows,
}: {
  rows: { label: string; n: number; cls?: string; suffix?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-32 shrink-0 truncate text-ink-600" title={r.label}>
            {r.label}
          </span>
          <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${r.cls ?? "bg-brand-blue"}`}
              style={{ width: `${(r.n / max) * 100}%` }}
            />
          </div>
          <span className="w-14 text-right text-ink-700 font-medium tabular-nums">
            {r.n}
            {r.suffix ?? ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
