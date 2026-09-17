"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  CalendarX,
  Clock,
  Users,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { CHART, ChartCard, LegendItem } from "@/components/charts/ChartKit";
import {
  ColumnChart,
  HBarChart,
  LeaveGrid,
  ProgressBudgetChart,
  ProjectTimelineChart,
  StackedHBarChart,
  UtilizationChart,
} from "@/components/dashboard/DashboardCharts";
import { formatTodayLong, todayISO, type LeaveEntry } from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useProjects } from "@/lib/projects-store";
import { useAccounts } from "@/lib/account-store";
import { ROLE_LABELS } from "@/lib/role";
import {
  dailyTeamHours,
  dayLabel,
  hoursByClient,
  openTasksByPerson,
  progressVsBudget,
  projectTimeline,
  projectsByStatus,
  projectsPastTarget,
  shortDay,
  signInRecency,
  upcomingLeave,
  usersByRole,
  utilization,
  workforce,
  type HourDay,
} from "@/lib/dashboard-metrics";

export default function OrgDashboardPage() {
  const router = useRouter();
  const { tasks, timeEntries } = useTasks();
  const { projects, clients } = useProjects();
  const { accounts } = useAccounts();

  // Logged hours per person per day, from the time log. The dashboard is
  // Admin-only and admins receive every entry, so these are team totals.
  const hourDays = useMemo<HourDay[]>(() => {
    const idByFirst = new Map(accounts.map((a) => [a.name.split(" ")[0], a.id]));
    const byKey = new Map<string, HourDay>();
    for (const e of timeEntries) {
      const userId = idByFirst.get(e.person);
      if (!userId) continue;
      const key = `${userId}|${e.date}`;
      const cur = byKey.get(key) ?? { userId, date: e.date, hours: 0 };
      cur.hours += e.hours;
      byKey.set(key, cur);
    }
    return Array.from(byKey.values());
  }, [timeEntries, accounts]);
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const today = todayISO();

  useEffect(() => {
    fetch("/api/leaves", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { leaves: [] }))
      .then((b) => setLeaves(b.leaves ?? []))
      .catch(() => null);
  }, []);

  // Projects
  const statusCounts = useMemo(() => projectsByStatus(projects), [projects]);
  const pastTarget = useMemo(() => projectsPastTarget(projects, today), [projects, today]);
  const timeline = useMemo(() => projectTimeline(projects, today), [projects, today]);
  const progress = useMemo(() => progressVsBudget(projects, tasks), [projects, tasks]);
  const clientHours = useMemo(() => hoursByClient(projects, clients), [projects, clients]);

  // Resources
  const util = useMemo(() => utilization(accounts, hourDays, today), [accounts, hourDays, today]);
  const daily = useMemo(() => dailyTeamHours(hourDays, today, 30), [hourDays, today]);
  const workload = useMemo(() => openTasksByPerson(accounts, tasks), [accounts, tasks]);
  const leave = useMemo(() => upcomingLeave(leaves, today, 10), [leaves, today]);

  // Users
  const roles = useMemo(() => usersByRole(accounts), [accounts]);
  const recency = useMemo(() => signInRecency(accounts, new Date()), [accounts]);

  const active = projects.filter((p) => p.status === "Active").length;
  const delivered = projects.filter((p) => p.status === "Delivered").length;
  const teamHours = Math.round(util.reduce((s, r) => s + r.hours, 0) * 10) / 10;
  const teamCapacity = util.reduce((s, r) => s + r.capacity, 0);
  const activeUsers = accounts.filter((a) => a.active).length;
  const recentSignIns = recency[0].count + recency[1].count;
  const overloaded = util.filter((r) => r.ratio > 1).length;
  const openTotal = workload.reduce((s, r) => s + r.onTime + r.overdue, 0);
  const overdueTotal = workload.reduce((s, r) => s + r.overdue, 0);
  const burning = progress.filter((r) => r.budgetUsed !== null && r.budgetUsed - r.progress >= 0.2).length;

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-ink-500 mt-1">
            Projects, resources and users at a glance · {formatTodayLong()}
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Active projects"
            value={active}
            Icon={FolderKanban}
            variant="blue"
            hint={`${projects.length} total · ${delivered} delivered`}
            onClick={() => router.push("/projects")}
          />
          <StatCard
            label="Past target date"
            value={pastTarget.length}
            Icon={CalendarX}
            variant={pastTarget.length > 0 ? "red" : "green"}
            hint="projects not yet delivered"
            onClick={() => router.push("/projects")}
          />
          <StatCard
            label="Team hours, last 5 working days"
            value={`${teamHours}h`}
            Icon={Clock}
            variant="yellow"
            hint={teamCapacity > 0 ? `${Math.round((teamHours / teamCapacity) * 100)}% of ${teamCapacity}h weekly capacity` : undefined}
            onClick={() => router.push("/resources")}
          />
          <StatCard
            label="Active users"
            value={activeUsers}
            Icon={Users}
            variant="green"
            hint={`${recentSignIns} signed in during the last 7 days`}
            onClick={() => router.push("/users")}
          />
        </section>

        {/* ------------------------------------------------ Projects */}
        <SectionHead title="Projects" href="/projects" linkLabel="Open Projects" />
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <ChartCard
            className="lg:col-span-2"
            title="Project timeline"
            subtitle={
              timeline.length === 0
                ? "No projects in progress."
                : `${timeline.length} project${timeline.length === 1 ? "" : "s"} not yet delivered · ${pastTarget.length} past target · click a row to open`
            }
            legend={
              <>
                <LegendItem color={CHART.accent} label="Time elapsed" />
                <LegendItem color={CHART.track} label="Time remaining" />
                <LegendItem color={CHART.critical} label="Past target date" />
                <LegendItem color={CHART.deemph} label="On hold" />
              </>
            }
            table={{
              head: ["Project", "Status", "Start", "Target", "Days left", "Days past target"],
              rows: timeline.map((r) => [r.name, r.status, shortDay(r.start), shortDay(r.target), r.daysLeft, r.daysLate]),
            }}
          >
            {timeline.length > 0 && <ProjectTimelineChart rows={timeline} today={today} />}
          </ChartCard>

          <ChartCard
            title="Projects by status"
            subtitle={`${projects.length} project${projects.length === 1 ? "" : "s"} in total`}
            table={{ head: ["Status", "Projects"], rows: statusCounts.map((r) => [r.status, r.count]) }}
          >
            <HBarChart
              rows={statusCounts.map((r) => ({
                key: r.status,
                label: r.status,
                value: r.count,
                tip: [{ text: r.status }, { text: `${r.count} project${r.count === 1 ? "" : "s"}`, strong: true }],
              }))}
            />
          </ChartCard>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-10">
          <ChartCard
            className="lg:col-span-2"
            title="Progress vs budget used"
            subtitle={
              progress.length === 0
                ? "No projects in progress."
                : burning > 0
                  ? `${burning} project${burning === 1 ? " is" : "s are"} using budget 20+ points faster than tasks get done · click a row to open`
                  : "Budget use is keeping pace with task progress · click a row to open"
            }
            legend={
              <>
                <LegendItem color={CHART.accent} kind="dot" label="Tasks done" />
                <LegendItem color={CHART.ink3} label="Budgeted hours used" />
                <LegendItem color={CHART.axis} kind="tick" label="100%" />
              </>
            }
            table={{
              head: ["Project", "Tasks done", "Progress", "Budget used"],
              rows: progress.map((r) => [
                r.name,
                `${r.done}/${r.total}`,
                `${Math.round(r.progress * 100)}%`,
                r.budgetUsed === null ? "No budget" : `${Math.round(r.budgetUsed * 100)}%`,
              ]),
            }}
          >
            {progress.length > 0 && <ProgressBudgetChart rows={progress} />}
          </ChartCard>

          <ChartCard
            title="Hours by client"
            subtitle={clientHours.length === 0 ? "No hours logged against projects yet." : "Logged project hours, all time"}
            table={{ head: ["Client", "Hours", "Projects"], rows: clientHours.map((r) => [r.client, r.hours, r.projects]) }}
          >
            <HBarChart
              unit="h"
              rows={clientHours.map((r) => ({
                key: r.clientId,
                label: r.client,
                value: r.hours,
                tip: [
                  { text: r.client },
                  { text: `${r.hours.toLocaleString("en-IN")}h logged`, strong: true },
                  { text: `${r.projects} project${r.projects === 1 ? "" : "s"}` },
                ],
              }))}
            />
          </ChartCard>
        </div>

        {/* ------------------------------------------------ Resources */}
        <SectionHead title="Resources" href="/resources" linkLabel="Open Resources" />
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <ChartCard
            title="Utilization, last 5 working days"
            subtitle={
              util.length === 0
                ? "No active team members."
                : overloaded > 0
                  ? `${overloaded} ${overloaded === 1 ? "person" : "people"} over weekly capacity`
                  : "Hours logged against each person's weekly capacity"
            }
            legend={
              <>
                <LegendItem color={CHART.accent} label="Hours logged" />
                <LegendItem color={CHART.critical} label="Over capacity" />
                <LegendItem color={CHART.ink3} kind="tick" label="Capacity" />
              </>
            }
            table={{
              head: ["Person", "Hours", "Capacity (h)", "Utilization"],
              rows: util.map((r) => [r.name, r.hours, r.capacity, `${Math.round(r.ratio * 100)}%`]),
            }}
          >
            {util.length > 0 && <UtilizationChart rows={util} />}
          </ChartCard>

          <ChartCard
            className="lg:col-span-2"
            title="Team hours per day, last 30 days"
            subtitle={`${Math.round(daily.reduce((s, d) => s + d.hours, 0) * 10) / 10}h logged across ${workforce(accounts).length} people · weekdays only`}
            table={{ head: ["Day", "Hours"], rows: daily.map((d) => [dayLabel(d.date) + " " + shortDay(d.date).split(" ")[1], d.hours]) }}
          >
            <ColumnChart
              axis
              valueLabels="extremes"
              height={210}
              rows={daily.map((d) => ({
                key: d.date,
                label: shortDay(d.date),
                value: d.hours,
                tip: [{ text: `${dayLabel(d.date)} ${shortDay(d.date).split(" ")[1]}` }, { text: `${d.hours}h logged`, strong: true }],
              }))}
            />
          </ChartCard>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-10">
          <ChartCard
            title="Open tasks per person"
            subtitle={
              workload.length === 0
                ? "Nobody has open tasks."
                : `${openTotal} open task assignment${openTotal === 1 ? "" : "s"} · ${overdueTotal} overdue`
            }
            legend={
              <>
                <LegendItem color={CHART.accent} label="On time" />
                <LegendItem color={CHART.critical} label="Overdue" />
              </>
            }
            table={{ head: ["Person", "On time", "Overdue"], rows: workload.map((r) => [r.name, r.onTime, r.overdue]) }}
          >
            <StackedHBarChart
              rows={workload.map((r) => ({
                key: r.name,
                label: r.name,
                segments: [
                  { name: "On time", value: r.onTime, color: CHART.accent },
                  { name: "Overdue", value: r.overdue, color: CHART.critical },
                ],
                tip: [
                  { text: r.name },
                  { text: `${r.onTime + r.overdue} open tasks`, strong: true },
                  { text: `${r.onTime} on time · ${r.overdue} overdue` },
                ],
              }))}
            />
          </ChartCard>

          <ChartCard
            className="lg:col-span-2"
            title="Leave, next 2 working weeks"
            subtitle={
              leave.rows.length === 0
                ? `Nobody is on leave between ${shortDay(leave.days[0])} and ${shortDay(leave.days[leave.days.length - 1])}.`
                : `${leave.rows.length} ${leave.rows.length === 1 ? "person" : "people"} off between ${shortDay(leave.days[0])} and ${shortDay(leave.days[leave.days.length - 1])}`
            }
            legend={
              leave.rows.length > 0 ? (
                <>
                  <LegendItem color={CHART.accent} label="Approved leave" />
                  <LegendItem color={CHART.ordinal[0]} label="Requested, pending" />
                </>
              ) : undefined
            }
            table={{
              head: ["Person", ...leave.days.map(dayLabel)],
              rows: leave.rows.map((r) => [r.fullName, ...r.cells.map((c) => (c === "approved" ? "Leave" : c === "pending" ? "Pending" : ""))]),
            }}
          >
            {leave.rows.length > 0 && <LeaveGrid days={leave.days} rows={leave.rows} />}
          </ChartCard>
        </div>

        {/* ------------------------------------------------ Users */}
        <SectionHead title="Users" href="/users" linkLabel="Open Users" />
        <div className="grid lg:grid-cols-2 gap-6">
          <ChartCard
            title="Users by role"
            subtitle={`${activeUsers} active · ${accounts.length - activeUsers} deactivated`}
            legend={
              <>
                <LegendItem color={CHART.accent} label="Active" />
                <LegendItem color={CHART.deemph} label="Deactivated" />
              </>
            }
            table={{ head: ["Role", "Active", "Deactivated"], rows: roles.map((r) => [ROLE_LABELS[r.role], r.active, r.inactive]) }}
          >
            <StackedHBarChart
              rows={roles.map((r) => ({
                key: r.role,
                label: ROLE_LABELS[r.role],
                segments: [
                  { name: "Active", value: r.active, color: CHART.accent },
                  { name: "Deactivated", value: r.inactive, color: CHART.deemph },
                ],
                tip: [
                  { text: ROLE_LABELS[r.role] },
                  { text: `${r.active} active`, strong: true },
                  { text: `${r.inactive} deactivated` },
                ],
              }))}
            />
          </ChartCard>

          <ChartCard
            title="Last sign-in"
            subtitle={`When each of the ${activeUsers} active users last signed in`}
            table={{ head: ["Last sign-in", "Users"], rows: recency.map((r) => [r.label, r.count]) }}
          >
            <ColumnChart
              height={196}
              rows={recency.map((r, i) => ({
                key: r.label,
                label: r.label,
                value: r.count,
                color: i === 4 ? CHART.deemph : CHART.ordinal[4 - i],
                tip: [{ text: `Last sign-in: ${r.label}` }, { text: `${r.count} user${r.count === 1 ? "" : "s"}`, strong: true }],
              }))}
            />
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHead({ title, href, linkLabel }: { title: string; href: string; linkLabel: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <h2 className="font-heading text-xl font-semibold text-ink-900">{title}</h2>
      <Link href={href} className="text-sm text-brand-blue hover:underline inline-flex items-center gap-1">
        {linkLabel} <ArrowRight size={14} />
      </Link>
    </div>
  );
}
