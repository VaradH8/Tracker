"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, AlertTriangle, Users } from "lucide-react";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";

type UserKpi = {
  id: string;
  name: string;
  role: DomainRole;
  done30: number;
  inProgress: number;
  todo: number;
  overdue: number;
  openEstHours: number;
  hours7: number;
  hours30: number;
};

type KpiPayload = {
  users: UserKpi[];
  weeks: { label: string; hours: number }[];
  totals: { members: number; done30: number; overdue: number; hours7: number };
};

export default function KpisPage() {
  const [data, setData] = useState<KpiPayload | null>(null);

  useEffect(() => {
    fetch("/api/domain/kpis", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (data === null) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }

  const { users, weeks, totals } = data;

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Team KPIs</h1>
        <p className="text-sm text-ink-500 mt-1">
          Output per person — completed tasks, logged hours, and overdue
          load. Completed counts cover the last 30 days.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label="Tasks completed (30d)"
          value={totals.done30}
          Icon={CheckCircle2}
          tone="green"
        />
        <StatTile
          label="Hours logged (7d)"
          value={`${totals.hours7}h`}
          Icon={Clock}
          tone="blue"
        />
        <StatTile
          label="Overdue open tasks"
          value={totals.overdue}
          Icon={AlertTriangle}
          tone={totals.overdue > 0 ? "red" : "green"}
        />
        <StatTile
          label="Working members"
          value={totals.members}
          Icon={Users}
          tone="blue"
        />
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          No team members yet (actionees, SMEs, or team leads).
        </p>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <Section title="Tasks completed per person · last 30 days">
              <BarList
                rows={users.map((u) => ({
                  label: u.name,
                  n: u.done30,
                  title: `${u.name}: ${u.done30} completed in the last 30 days`,
                }))}
                barCls="bg-brand-green"
              />
            </Section>

            <Section title="Hours logged per person · last 30 days">
              <BarList
                rows={users.map((u) => ({
                  label: u.name,
                  n: u.hours30,
                  suffix: "h",
                  title: `${u.name}: ${u.hours30}h logged in the last 30 days`,
                }))}
                barCls="bg-brand-blue"
              />
            </Section>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <Section title="Team hours · last 6 weeks">
              <WeekCols data={weeks} />
            </Section>

            <Section title="Open workload">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200">
                      <th className="py-2 pr-3">Person</th>
                      <th className="py-2 pr-3">In progress</th>
                      <th className="py-2 pr-3">To do</th>
                      <th className="py-2 pr-3">Overdue</th>
                      <th className="py-2">Est. open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-ink-900">
                            {u.name}
                          </div>
                          <div className="text-xs text-ink-500">
                            {DOMAIN_ROLE_LABELS[u.role]}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-ink-700 tabular-nums">
                          {u.inProgress}
                        </td>
                        <td className="py-2 pr-3 text-ink-700 tabular-nums">
                          {u.todo}
                        </td>
                        <td
                          className={`py-2 pr-3 tabular-nums ${
                            u.overdue > 0
                              ? "text-brand-redText font-medium"
                              : "text-ink-500"
                          }`}
                        >
                          {u.overdue}
                        </td>
                        <td className="py-2 text-ink-700 tabular-nums">
                          {u.openEstHours}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-heading text-base font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

const TILE_TONES = {
  blue: "bg-brand-blueBg text-brand-blue",
  green: "bg-brand-greenBg text-brand-greenText",
  red: "bg-brand-redBg text-brand-redText",
} as const;

function StatTile({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string | number;
  Icon: typeof Users;
  tone: keyof typeof TILE_TONES;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span
        className={`w-9 h-9 rounded grid place-items-center shrink-0 ${TILE_TONES[tone]}`}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="font-heading text-xl font-semibold text-ink-900 leading-tight">
          {value}
        </div>
        <div className="text-xs text-ink-500 truncate">{label}</div>
      </div>
    </div>
  );
}

function BarList({
  rows,
  barCls,
}: {
  rows: { label: string; n: number; suffix?: string; title?: string }[];
  barCls: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.label}
          className="flex items-center gap-3 text-sm"
          title={r.title}
        >
          <span className="w-32 shrink-0 truncate text-ink-600" title={r.label}>
            {r.label}
          </span>
          <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${barCls}`}
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

function WeekCols({ data }: { data: { label: string; hours: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.hours));
  return (
    <div className="flex items-end gap-3 h-32">
      {data.map((d) => (
        <div
          key={d.label}
          className="flex-1 flex flex-col items-center gap-1"
          title={`Week of ${d.label}: ${d.hours}h`}
        >
          <span className="text-[10px] text-ink-500 tabular-nums">
            {d.hours}
          </span>
          <div className="w-full flex items-end" style={{ height: "80px" }}>
            <div
              className="w-full bg-brand-blue rounded-t"
              style={{ height: `${(d.hours / max) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-ink-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
