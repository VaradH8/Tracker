"use client";

/**
 * Building blocks shared by the review pages — /performance (reviewers)
 * and /my-performance (the employee's own view): section cards, tables,
 * status pills, text / rating fields and the metric tiles.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { statusPill, type Status } from "@/lib/mock";
import { localToday } from "@/lib/engagement";
import type { Metrics, TextField } from "@/lib/performance/report";

export type Draft = Record<string, string>;

export const inputCls =
  "h-9 rounded border border-ink-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue";
export const areaCls =
  "w-full rounded border border-ink-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue";

export function previousMonth(): string {
  const [y, m] = localToday().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * A numbered form section. `collapsible` turns the header into a toggle
 * (closed by default unless `defaultOpen`), with `summary` shown beside
 * the title so a closed section still says what's inside.
 */
export function Section({
  n,
  title,
  note,
  action,
  collapsible = false,
  defaultOpen = false,
  summary,
  children,
}: {
  n: number;
  title: string;
  note?: string;
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const heading = (
    <h2 className="font-heading text-base font-semibold">
      <span className="text-brand-blue mr-1.5">{n}.</span>
      {title}
    </h2>
  );
  return (
    <section className="card p-5">
      <div className={`flex items-center justify-between gap-2 ${open ? "mb-3" : ""}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left -m-1 p-1 rounded hover:bg-ink-50"
          >
            {open ? <ChevronDown size={18} className="text-ink-500" /> : <ChevronRight size={18} className="text-ink-500" />}
            {heading}
            {summary && <span className="text-xs text-ink-500">{summary}</span>}
            <span className="ml-auto text-xs font-medium text-brand-blue">{open ? "Hide" : "Show"}</span>
          </button>
        ) : (
          heading
        )}
        {action}
      </div>
      {open && note && <p className="text-xs text-ink-500 -mt-2 mb-3">{note}</p>}
      {open && children}
    </section>
  );
}

/** "4 tasks · 2 completed · 1 delayed" — what a collapsed task section
 *  holds, by status. */
export function countSummary(statuses: string[]): string {
  if (!statuses.length) return "No tasks";
  const by = new Map<string, number>();
  for (const s of statuses) by.set(s, (by.get(s) ?? 0) + 1);
  const parts = [...by.entries()].map(([s, n]) => `${n} ${s.toLowerCase()}`);
  return [`${statuses.length} task${statuses.length === 1 ? "" : "s"}`, ...parts].join(" · ");
}

/** A task's status the way My Tasks shows it: the status pill in the
 *  board's colours, plus "Overdue Nd" when it's past its target. */
export function TaskStatusCell({ status, overdueDays }: { status: string; overdueDays: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={statusPill(status as Status) ?? "pill-grey"}>{status}</span>
      {overdueDays != null && overdueDays > 0 && (
        <span className="pill-red text-[10px] py-0.5">Overdue {overdueDays}d</span>
      )}
    </div>
  );
}

export function Detail({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className={value ? "text-ink-900" : "text-ink-400"}>{value || (missing ? "Not set" : "—")}</dd>
    </div>
  );
}

export function Table({ head, empty, children }: { head: string[]; empty?: string; children: ReactNode }) {
  const rows = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[640px]">
        <thead>
          <tr className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium border-b border-ink-200">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.length ? children : (
            <tr><td colSpan={head.length} className="px-3 py-4 text-center text-ink-400">{empty ?? "Nothing to show."}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

const STATUS_PILL: Record<string, string> = {
  Completed: "pill-green",
  "On Track": "pill-blue",
  "In Progress": "pill-blue",
  "In Review": "pill-blue",
  "At Risk": "pill-yellow",
  Blocked: "pill-yellow",
  Delayed: "pill-red",
  "Not Started": "pill-grey",
};

export function StatusPill({ s }: { s: string }) {
  return <span className={STATUS_PILL[s] ?? "pill-grey"}>{s}</span>;
}

export type FieldProps = { draft: Draft; set: (k: string) => (v: string) => void; editable: boolean };

export function Text({ field, draft, set, editable, rows = 2 }: FieldProps & { field: TextField; rows?: number }) {
  const value = draft[field.key] ?? "";
  if (!editable) return <span className="whitespace-pre-wrap text-ink-700">{value || "—"}</span>;
  return (
    <textarea
      aria-label={field.label}
      className={areaCls}
      rows={rows}
      value={value}
      onChange={(e) => set(field.key)(e.target.value)}
    />
  );
}

export function Prompts({ fields, ...p }: FieldProps & { fields: TextField[] }) {
  return (
    <div className="divide-y divide-ink-100">
      {fields.map((f) => (
        <div key={f.key} className="grid md:grid-cols-[260px_1fr] gap-2 py-2">
          <div className="text-sm font-medium text-ink-700 pt-1.5">{f.label}</div>
          <Text field={f} {...p} />
        </div>
      ))}
    </div>
  );
}

export function RatingSelect({ k, draft, set, editable, label }: FieldProps & { k: string; label: string }) {
  const v = draft[k] ?? "";
  if (!editable) return <span className="font-medium">{v || "—"}</span>;
  return (
    <select aria-label={label} className={`${inputCls} w-16`} value={v} onChange={(e) => set(k)(e.target.value)}>
      <option value="">—</option>
      {[5, 4, 3, 2, 1].map((n) => (
        <option key={n} value={String(n)}>{n}</option>
      ))}
    </select>
  );
}

export function MetricTiles({ m }: { m: Metrics }) {
  const f = (v: number | null) => (v == null ? "—" : `${v}%`);
  const tiles: [string, string, string?][] = [
    ["Tasks completed", String(m.tasksCompleted), `${m.tasksInScope} in this period`],
    ["Completion", f(m.completionRate), "of work due or finished"],
    ["On time", f(m.onTimeRate), "completed by target date"],
    ["Hours logged", `${m.hoursLogged} h`, `${f(m.utilization)} of ${m.capacityHours} h available`],
    ["Leave", `${m.leaveDays} d`, m.unplannedLeaveDays ? `${m.unplannedLeaveDays} unplanned` : "of " + m.workingDays + " working days"],
    ["Overdue", String(m.overdueOpen), "open past target"],
  ];
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map(([label, value, hint]) => (
        <div key={label} className="card p-3">
          <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
          <div className="font-heading text-xl font-semibold">{value}</div>
          {hint && <div className="text-xs text-ink-500">{hint}</div>}
        </div>
      ))}
      {(m.missingTargets > 0 || m.missingEstimates > 0) && (
        <p className="col-span-full text-xs text-brand-yellowText bg-brand-yellowBg rounded px-3 py-2">
          {m.missingTargets} task(s) have no target date and {m.missingEstimates} no estimate — on-time, progress and
          accuracy figures only count tasks that have them.
        </p>
      )}
    </section>
  );
}
