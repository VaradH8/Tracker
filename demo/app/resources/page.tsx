"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Mail,
  MapPin,
  Phone,
  Calendar,
  TrendingUp,
  Search,
  X,
  Activity,
  Briefcase,
  Users as UsersIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import {
  RESOURCES,
  performancePill,
  loggedHours,
  formatINR,
  firstNameOf,
  type Resource,
  type PerformanceFlag,
} from "@/lib/mock";
import { useTasks } from "@/lib/tasks-store";
import { useRole } from "@/lib/role";

const FILTERS: PerformanceFlag[] = ["On track", "Watch", "Idle"];

type ActiveFilter = PerformanceFlag | "Flagged" | null;

export default function ResourcesPage() {
  const [active, setActive] = useState<ActiveFilter>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Resource | null>(null);
  const { tasks } = useTasks();

  // Honour deep-links like /resources?filter=flagged from the dashboard.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f === "flagged") setActive("Flagged");
    else if (f === "watch") setActive("Watch");
    else if (f === "idle") setActive("Idle");
    else if (f === "ontrack") setActive("On track");
  }, []);

  const visible = RESOURCES.filter((r) => r.status === "Active")
    .filter((r) => {
      if (!active) return true;
      if (active === "Flagged") return r.performance !== "On track";
      return r.performance === active;
    })
    .filter((r) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.designation.toLowerCase().includes(q)
      );
    });

  const stats = {
    total: RESOURCES.filter((r) => r.status === "Active").length,
    onTrack: RESOURCES.filter((r) => r.performance === "On track").length,
    watch: RESOURCES.filter((r) => r.performance === "Watch").length,
    idle: RESOURCES.filter((r) => r.performance === "Idle").length,
  };

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Resources</h1>
          <p className="text-sm text-ink-500 mt-1">
            Everyone in the team. What they're working on, how they're
            tracking, and where to look first.
          </p>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            label="Total"
            value={stats.total}
            tone="bg-brand-blueBg text-brand-blue"
            onClick={() => setActive(null)}
            active={active === null}
          />
          <SummaryCard
            label="On track"
            value={stats.onTrack}
            tone="bg-brand-greenBg text-brand-greenText"
            onClick={() => setActive(active === "On track" ? null : "On track")}
            active={active === "On track"}
          />
          <SummaryCard
            label="Watch"
            value={stats.watch}
            tone="bg-brand-yellowBg text-brand-yellowText"
            onClick={() => setActive(active === "Watch" ? null : "Watch")}
            active={active === "Watch"}
          />
          <SummaryCard
            label="Idle"
            value={stats.idle}
            tone="bg-brand-redBg text-brand-redText"
            onClick={() => setActive(active === "Idle" ? null : "Idle")}
            active={active === "Idle"}
          />
        </section>

        <div className="card p-3 mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, role…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActive(active === f ? null : f)}
              className={
                active === f
                  ? "pill-blue cursor-pointer"
                  : "pill-grey cursor-pointer hover:bg-ink-200"
              }
            >
              {f}
            </button>
          ))}
        </div>

        {active === "Flagged" && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-card bg-brand-yellowBg text-brand-yellowText text-sm">
            <AlertTriangle size={14} />
            Showing flagged resources (Watch + Idle).
            <button
              onClick={() => setActive(null)}
              className="ml-auto text-xs underline hover:no-underline"
            >
              Clear
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState
            Icon={UsersIcon}
            title="No resources match"
            message={
              query.trim()
                ? `Nothing matches “${query}”. Try a different name or role.`
                : "No resources in this view. Clear the filter to see everyone."
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visible.map((r) => {
              const myTasks = tasks.filter((t) =>
                t.assignees.includes(r.name.split(" ")[0]),
              );
              const open = myTasks.filter((t) => t.status !== "Done").length;
              return (
                <ResourceCard
                  key={r.id}
                  r={r}
                  openTasks={open}
                  onOpen={() => setSelected(r)}
                />
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <ResourceDrawer
          resource={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left transition w-full ${
        active ? "ring-2 ring-brand-blue" : "hover:shadow-md"
      }`}
    >
      <div
        className={`inline-flex items-center px-2 py-0.5 rounded-pill text-xs font-medium mb-2 ${tone}`}
      >
        {label}
      </div>
      <div className="font-heading text-2xl font-semibold">{value}</div>
    </button>
  );
}

function ResourceCard({
  r,
  openTasks,
  onOpen,
}: {
  r: Resource;
  openTasks: number;
  onOpen: () => void;
}) {
  const perf = performancePill(r.performance);
  const utilization = Math.round((r.hoursLast7 / r.capacityPerWeek) * 100);
  const utilizationTone =
    utilization < 60
      ? "text-brand-redText"
      : utilization < 85
        ? "text-brand-yellowText"
        : "text-brand-greenText";
  const initials = r.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <button
      onClick={onOpen}
      className="card p-5 text-left w-full hover:shadow-md transition"
    >
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-full bg-brand-blue text-white grid place-items-center font-heading font-medium">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-base text-ink-900">
              {r.name}
            </h3>
            <span className={perf.cls}>● {r.performance}</span>
          </div>
          <p className="text-xs text-ink-500 mt-0.5">
            {r.designation} · {r.location}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Metric
          label="Hours / 7d"
          value={`${r.hoursLast7}h`}
          sub={`${utilization}% capacity`}
          subTone={utilizationTone}
        />
        <Metric
          label="Open tasks"
          value={openTasks}
          sub={r.tasksOverdue > 0 ? `${r.tasksOverdue} overdue` : "0 overdue"}
          subTone={r.tasksOverdue > 0 ? "text-brand-redText" : "text-ink-500"}
        />
        <Metric
          label="Estimate acc."
          value={`${r.estimateAccuracy}%`}
          sub="last 30d"
        />
      </div>

      {r.flags.length > 0 && (
        <div className="bg-brand-yellowBg border border-brand-yellowBorder rounded-card p-3 text-xs text-brand-yellowText flex gap-2 mb-3">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <ul className="space-y-0.5">
            {r.flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-ink-500 flex items-center gap-3 pt-3 border-t border-ink-100">
        <span className="inline-flex items-center gap-1">
          <Activity size={11} /> Last edit {r.lastStatusChange}
        </span>
        {r.upcomingLeaveStart && (
          <span className="inline-flex items-center gap-1">
            <Calendar size={11} /> Leave {r.upcomingLeaveStart} →{" "}
            {r.upcomingLeaveEnd}
          </span>
        )}
      </div>
    </button>
  );
}

function Metric({
  label,
  value,
  sub,
  subTone = "text-ink-500",
}: {
  label: string;
  value: string | number;
  sub: string;
  subTone?: string;
}) {
  return (
    <div className="bg-ink-50 rounded-card p-2.5">
      <div className="text-[10px] text-ink-500 uppercase tracking-wide font-semibold">
        {label}
      </div>
      <div className="font-heading text-lg font-semibold text-ink-900">
        {value}
      </div>
      <div className={`text-[11px] ${subTone}`}>{sub}</div>
    </div>
  );
}

function ResourceDrawer({
  resource: r,
  onClose,
}: {
  resource: Resource;
  onClose: () => void;
}) {
  const { tasks, timeEntries } = useTasks();
  const [role] = useRole();
  const isAdmin = role === "Admin";
  const person = firstNameOf(r.name);
  const myTasks = tasks.filter((t) => t.assignees.includes(person));
  const hours7 = loggedHours(person, timeEntries, 7);
  const hours30 = loggedHours(person, timeEntries, 30);
  const utilization = Math.round((hours7 / r.capacityPerWeek) * 100);
  const monthlyCost = hours30 * r.hourlyRate;
  const perf = performancePill(r.performance);
  const initials = r.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-ink-900/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside className="w-full max-w-[520px] bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-200 flex items-center gap-3">
          <h2 className="font-heading font-semibold text-base">
            Resource details
          </h2>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded hover:bg-ink-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-blue text-white grid place-items-center font-heading font-semibold text-xl">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-xl font-semibold">{r.name}</h3>
              <p className="text-sm text-ink-500">{r.designation}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={perf.cls}>● {r.performance}</span>
                <span className="pill-grey">{r.primaryRole}</span>
              </div>
            </div>
          </div>

          <section>
            <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2">
              Contact
            </h4>
            <div className="card p-4 space-y-2 text-sm">
              <Row icon={<Mail size={13} />} value={r.email} />
              <Row icon={<Phone size={13} />} value={r.phone} />
              <Row icon={<MapPin size={13} />} value={r.location} />
              <Row icon={<Briefcase size={13} />} value={`Joined ${r.joined}`} />
            </div>
          </section>

          <section>
            <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2">
              Workload (this week)
            </h4>
            <div className="card p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm text-ink-700">Hours logged</span>
                <span className="font-heading text-lg font-semibold">
                  {hours7}h / {r.capacityPerWeek}h
                </span>
              </div>
              <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    utilization < 60
                      ? "bg-brand-red"
                      : utilization < 85
                        ? "bg-brand-yellow"
                        : "bg-brand-green"
                  }`}
                  style={{ width: `${Math.min(utilization, 100)}%` }}
                />
              </div>
              <p className="text-xs text-ink-500 mt-2">
                {utilization}% capacity · {hours30}h logged in the last 30 days
              </p>
            </div>
          </section>

          {isAdmin && (
            <section>
              <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2">
                Cost — Admin only
              </h4>
              <div className="card p-4 border-brand-yellowBorder bg-brand-yellowBg/40">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="font-heading text-lg font-semibold text-ink-900">
                      {formatINR(r.hourlyRate)}
                    </div>
                    <div className="text-[10px] text-ink-500 uppercase tracking-wide">
                      Hourly rate
                    </div>
                  </div>
                  <div>
                    <div className="font-heading text-lg font-semibold text-ink-900">
                      {hours30}h
                    </div>
                    <div className="text-[10px] text-ink-500 uppercase tracking-wide">
                      Logged 30d
                    </div>
                  </div>
                  <div>
                    <div className="font-heading text-lg font-semibold text-brand-yellowText">
                      {formatINR(monthlyCost)}
                    </div>
                    <div className="text-[10px] text-ink-500 uppercase tracking-wide">
                      Cost 30d
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-ink-500 mt-3">
                  Cost = hours logged × hourly rate. Visible to Admin only —
                  use alongside the performance signals below to inform
                  compensation and staffing decisions.
                </p>
              </div>
            </section>
          )}

          <section>
            <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2">
              Performance signals
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <SignalCard
                label="Tasks done (30d)"
                value={r.tasksDone30}
                Icon={TrendingUp}
              />
              <SignalCard
                label="Open tasks"
                value={r.tasksOpen}
                Icon={Activity}
              />
              <SignalCard
                label="Overdue"
                value={r.tasksOverdue}
                Icon={AlertTriangle}
                tone={r.tasksOverdue > 0 ? "red" : "default"}
              />
              <SignalCard
                label="Estimate accuracy"
                value={`${r.estimateAccuracy}%`}
                Icon={TrendingUp}
              />
            </div>
            {r.flags.length > 0 && (
              <div className="mt-3 bg-brand-yellowBg border border-brand-yellowBorder rounded-card p-3">
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-brand-yellowText uppercase tracking-wide">
                  <AlertTriangle size={12} /> Flags
                </div>
                <ul className="text-sm text-brand-yellowText space-y-1 list-disc list-inside">
                  {r.flags.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-ink-500 mt-2 italic">
                  Surface for a one-on-one. No automatic action.
                </p>
              </div>
            )}
          </section>

          {r.upcomingLeaveStart && (
            <section>
              <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2">
                Upcoming leave
              </h4>
              <div className="card p-3 flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-brand-blue" />
                {r.upcomingLeaveStart} → {r.upcomingLeaveEnd}
              </div>
            </section>
          )}

          <section>
            <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2">
              Active assignments ({myTasks.filter((t) => t.status !== "Done").length})
            </h4>
            <ul className="space-y-2">
              {myTasks.filter((t) => t.status !== "Done").length === 0 ? (
                <li className="text-xs text-ink-500 italic">
                  No active assignments.
                </li>
              ) : (
                myTasks
                  .filter((t) => t.status !== "Done")
                  .slice(0, 5)
                  .map((t) => (
                    <li
                      key={t.id}
                      className="card p-3 text-sm flex items-center gap-2"
                    >
                      <span className="flex-1 truncate">{t.title}</span>
                      <span className={`pill-grey text-[10px] py-0`}>
                        {t.status}
                      </span>
                    </li>
                  ))
              )}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Row({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 text-ink-700">
      <span className="text-ink-500">{icon}</span> {value}
    </div>
  );
}

function SignalCard({
  label,
  value,
  Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  Icon: typeof TrendingUp;
  tone?: "default" | "red";
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-ink-500 uppercase tracking-wide font-semibold mb-1">
        <Icon size={11} />
        {label}
      </div>
      <div
        className={`font-heading text-xl font-semibold ${tone === "red" ? "text-brand-redText" : "text-ink-900"}`}
      >
        {value}
      </div>
    </div>
  );
}
