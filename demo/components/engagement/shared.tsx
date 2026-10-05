"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  localToday,
  periodLabel,
  periodsFor,
  shiftAnchor,
  workingDaySet,
  type EngagementBlock,
  type Granularity,
  type LeaveBlock,
  type Period,
  type Track,
} from "@/lib/engagement";
import type { Role } from "@/lib/role";

/* ------------------------------------------------------------------ data */

export type EngagementPerson = {
  id: string;
  name: string;
  shortName: string;
  role: Role;
  designation: string;
  track: Track | null;
  hoursPerDay: number;
};

export type PersonWorkload = {
  utilization30: number;
  openTasks: number;
  overdueTasks: number;
  remainingHours: number;
  projects: number;
};

export type PlanningProject = {
  id: number;
  name: string;
  client: string;
  status: string;
  startDate: string;
  targetDate: string;
  budgetHours: number;
  loggedHours: number;
  openEstimateHours: number;
};

export type SavedForecast = {
  projectId: number;
  projectName: string;
  /** The project is Delivered — shown under Completed, reserves nobody. */
  completed: boolean;
  track: Track;
  startDate: string;
  targetDate: string | null;
  effortHours: number;
  memberIds: string[];
  updatedAt: string;
};

export type EngagementData = {
  today: string;
  workingDays: string[];
  hoursPerDay: number;
  people: EngagementPerson[];
  blocks: EngagementBlock[];
  leaves: LeaveBlock[];
  workload: Record<string, PersonWorkload>;
  projects: PlanningProject[];
  forecasts: SavedForecast[];
};

/** Loads /api/engagement once `enabled` (the viewer may open the page). */
export function useEngagementData(enabled = true) {
  const [data, setData] = useState<EngagementData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/engagement", { cache: "no-store" });
      if (!r.ok) {
        setError(r.status === 403 ? "You don't have access to engagement data." : "Couldn't load engagement data.");
        return;
      }
      setData((await r.json()) as EngagementData);
      setError(null);
    } catch {
      setError("Couldn't load engagement data.");
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
  }, [reload, enabled]);

  return { data, error, reload };
}

/** Group a flat list by userId. */
export function byUser<T extends { userId: string }>(rows: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) (out[r.userId] ??= []).push(r);
  return out;
}

/** Working-day set from the API payload, memoised. */
export function useWorkDays(data: EngagementData | null) {
  return useMemo(() => workingDaySet(data?.workingDays ?? []), [data?.workingDays]);
}

export const fmtHours = (h: number) =>
  `${Math.round(h * 10) / 10}h`;

export const TRACK_PILL: Record<Track, string> = {
  Application: "pill-blue",
  Plugin: "pill-green",
};

/* -------------------------------------------------------------- widgets */

export function StatTile({
  label,
  value,
  tone = "text-ink-900",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="card px-4 py-3" title={hint}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className={`font-heading text-xl font-semibold leading-tight mt-0.5 ${tone}`}>
        {value}
      </div>
    </div>
  );
}

export type GridView = { gran: Granularity; anchor: string };

export function useGridView(initialAnchor?: string) {
  const [view, setView] = useState<GridView>({
    gran: "weekly",
    anchor: initialAnchor ?? localToday(),
  });
  return { view, setView };
}

export function usePeriods(view: GridView, workDays: Set<number>): Period[] {
  return useMemo(
    () => periodsFor(view.gran, view.anchor, workDays),
    [view.gran, view.anchor, workDays],
  );
}

const GRANS: Granularity[] = ["weekly", "monthly", "yearly"];

export function PeriodControls({
  view,
  setView,
}: {
  view: GridView;
  setView: (v: GridView) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded border border-ink-200 bg-white p-0.5">
        {GRANS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setView({ ...view, gran: g })}
            className={`rounded px-3 py-1 text-sm font-medium capitalize ${
              view.gran === g
                ? "bg-brand-blue text-white"
                : "text-ink-700 hover:bg-ink-100"
            }`}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="flex items-center rounded border border-ink-200 bg-white">
        <button
          type="button"
          aria-label="Previous"
          onClick={() => setView({ ...view, anchor: shiftAnchor(view.gran, view.anchor, -1) })}
          className="px-2 py-1.5 text-ink-500 hover:bg-ink-100"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          title="Jump to today"
          onClick={() => setView({ ...view, anchor: localToday() })}
          className="min-w-[11rem] px-2 py-1 text-sm font-medium text-ink-700 hover:bg-ink-100"
        >
          {periodLabel(view.gran, view.anchor)}
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => setView({ ...view, anchor: shiftAnchor(view.gran, view.anchor, 1) })}
          className="px-2 py-1.5 text-ink-500 hover:bg-ink-100"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export const inputCls =
  "h-9 rounded border border-ink-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue";

export const labelCls =
  "text-[11px] font-medium uppercase tracking-wide text-ink-500";
