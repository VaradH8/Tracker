"use client";

import type { ReactNode } from "react";
import {
  blocksIn,
  fmtDay,
  groupSpans,
  type EngagementBlock,
  type ForecastBlock,
  type Granularity,
  type LeaveBlock,
  type Period,
} from "@/lib/engagement";

export type GridRow = {
  id: string;
  label: string;
  /** Small tag after the name (track, role…). */
  tag?: ReactNode;
};

/**
 * People × time grid. Each cell is one day (weekly / monthly) or one week
 * (yearly) and is coloured by what that person is on:
 *   violet = forecast (what-if), blue = engaged on a project,
 *   amber = on leave, grey = non-working day, white = free.
 * Hovering a cell lists the projects; clicking a name calls onSelect.
 */
export function EngagementGrid({
  rows,
  periods,
  gran,
  today,
  work,
  forecast,
  leaves,
  onSelect,
  emptyText,
}: {
  rows: GridRow[];
  periods: Period[];
  gran: Granularity;
  today: string;
  work: Record<string, EngagementBlock[]>;
  forecast?: Record<string, ForecastBlock[]>;
  leaves: Record<string, LeaveBlock[]>;
  onSelect?: (id: string) => void;
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-ink-400">
        {emptyText ?? "Nobody matches these filters."}
      </div>
    );
  }
  const spans = groupSpans(periods);
  const dense = periods.length > 7;
  const colW = gran === "weekly" ? "minmax(64px,1fr)" : gran === "monthly" ? "minmax(26px,1fr)" : "minmax(14px,1fr)";
  const template = `minmax(170px, 220px) repeat(${periods.length}, ${colW})`;

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-max" style={{ display: "grid", gridTemplateColumns: template }}>
        {/* Header band: months */}
        <div
          className="row-span-2 sticky left-0 z-10 bg-ink-50 border-b border-r border-ink-200 px-3 flex items-end pb-2 font-heading text-sm font-semibold text-ink-700"
        >
          Employee
        </div>
        {spans.map((s, i) => (
          <div
            key={`${s.group}-${i}`}
            style={{ gridColumn: `span ${s.count}` }}
            className="bg-ink-50 border-b border-r border-ink-200 py-1 text-center text-xs font-semibold text-brand-blue truncate"
          >
            {s.group}
          </div>
        ))}
        {periods.map((p) => {
          const isToday = p.start <= today && p.end >= today;
          return (
            <div
              key={p.start}
              title={p.start === p.end ? fmtDay(p.start) : `${fmtDay(p.start)} – ${fmtDay(p.end)}`}
              className={`border-b border-r border-ink-200 py-1.5 text-center text-[11px] whitespace-nowrap ${
                isToday
                  ? "bg-brand-blueBg text-brand-blue font-semibold"
                  : p.offDay
                    ? "bg-ink-100 text-ink-400"
                    : "bg-ink-50 text-ink-500"
              }`}
            >
              {p.label}
            </div>
          );
        })}

        {rows.map((r) => (
          <Row
            key={r.id}
            row={r}
            periods={periods}
            dense={dense}
            work={work[r.id]}
            forecast={forecast?.[r.id]}
            leaves={leaves[r.id]}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  periods,
  dense,
  work,
  forecast,
  leaves,
  onSelect,
}: {
  row: GridRow;
  periods: Period[];
  dense: boolean;
  work?: EngagementBlock[];
  forecast?: ForecastBlock[];
  leaves?: LeaveBlock[];
  onSelect?: (id: string) => void;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 bg-white border-b border-r border-ink-200 px-3 py-2 flex items-center gap-2 min-w-0">
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(row.id)}
            className="text-sm font-medium text-ink-900 hover:text-brand-blue truncate text-left"
          >
            {row.label}
          </button>
        ) : (
          <span className="text-sm font-medium text-ink-900 truncate">{row.label}</span>
        )}
        {row.tag}
      </div>
      {periods.map((p) => {
        const w = blocksIn(work, p.start, p.end);
        const f = blocksIn(forecast, p.start, p.end);
        const l = blocksIn(leaves, p.start, p.end);
        // A day off isn't "free" — leave the weekend grey even if a task
        // spans it.
        const off = p.offDay;
        let cls = "bg-white";
        let tip = "Free";
        if (off) {
          cls = "bg-ink-100";
          tip = "Non-working day";
        } else if (l.length && p.start === p.end) {
          cls = "bg-brand-yellowBg";
          tip = `On leave (${l.map((x) => x.type).join(", ")})`;
        } else if (f.length) {
          cls = "bg-violet-400";
          tip = `Forecast: ${f.map((x) => x.projectName).join(", ")}`;
        } else if (w.length) {
          cls = w.length > 1 ? "bg-brand-blue" : "bg-brand-blue/60";
          tip = w
            .map((b) => `${b.projectName} — ${b.openTasks} open task${b.openTasks === 1 ? "" : "s"}${b.overdueTasks ? `, ${b.overdueTasks} overdue` : ""}`)
            .join("\n");
        } else if (l.length) {
          cls = "bg-brand-yellowBg";
          tip = `On leave part of this week (${l.map((x) => x.type).join(", ")})`;
        }
        if (!off && f.length && w.length) {
          tip += `\nAlso on: ${w.map((b) => b.projectName).join(", ")}`;
        }
        const multi = !off && !f.length && w.length > 1 && !dense;
        return (
          <div
            key={p.start}
            title={tip}
            className={`border-b border-r border-ink-200 min-h-[40px] grid place-items-center text-[11px] font-medium text-white ${cls}`}
          >
            {multi ? `${w.length} projects` : ""}
          </div>
        );
      })}
    </>
  );
}

export function GridLegend({ forecast = false }: { forecast?: boolean }) {
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded-sm border border-ink-200 ${cls}`} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
      {forecast && item("bg-violet-400", "Forecast (what-if)")}
      {item("bg-brand-blue/60", "Busy on a project")}
      {item("bg-brand-blue", "On 2+ projects")}
      {item("bg-brand-yellowBg", "On leave")}
      {item("bg-white", "Free")}
      {item("bg-ink-100", "Non-working day")}
    </div>
  );
}
