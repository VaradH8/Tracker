"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TAG_HOLDER_ROLES, DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import { fmtDate } from "@/lib/domain-format";
import { selectClass } from "@/lib/domain-ui";

/**
 * Who is free, who is booked, and until when — read in one pass.
 *
 * This replaced a nine-column table. The table held more, but answering
 * "can Priya take this on?" meant reading across nine cells and comparing
 * two dates in your head, for every person, one at a time.
 *
 * So the bookings are drawn instead of tabulated, on a single shared time
 * axis. One axis for everybody is the whole point: a bar you can compare
 * by eye against the row above it turns "who frees up first" from an
 * arithmetic exercise into a glance. Today is marked once, straight down
 * the chart, so "how long until this person is free" is a distance rather
 * than a subtraction.
 *
 * What was dropped: measured-vs-expected rate columns. They matter when
 * you are tuning a forecast, and they are noise when you are asking who
 * is free — Forecast is where the first question belongs.
 */

export type BoardResource = {
  id: string;
  name: string;
  role: string;
  status: "Free" | "Allocated" | string;
  openTags: number;
  availableFrom: string | null;
  projects: {
    projectId: number;
    projectName: string;
    startDate: string;
    endDate: string;
    assignedTags: number;
    deliveredTags: number;
    openTags: number;
  }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function days(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One colour per PROJECT, held steady down the whole chart.
 *
 * The first version coloured by position in each person's list, so the
 * same project came out blue on one row and green on the next — which
 * makes the colour actively misleading: it looks like it means something
 * and it doesn't. Keyed by project id instead, with a key printed above
 * the chart, the colour answers "is this the same job?" at a glance.
 */
const BAND = [
  { bar: "bg-brand-blue", dot: "bg-brand-blue" },
  { bar: "bg-brand-yellow", dot: "bg-brand-yellow" },
  { bar: "bg-brand-green", dot: "bg-brand-green" },
  { bar: "bg-brand-red", dot: "bg-brand-red" },
  // Darker shades continue the run. Every entry has to be a real
  // background token: an earlier version reached for `brand-blueText`,
  // which is a text colour with no bg- utility, so the fifth project
  // silently drew no swatch at all.
  { bar: "bg-brand-greenText", dot: "bg-brand-greenText" },
  { bar: "bg-brand-yellowText", dot: "bg-brand-yellowText" },
  { bar: "bg-brand-redText", dot: "bg-brand-redText" },
];

/**
 * Bookings that overlap in time get their own lane, so somebody on two
 * projects at once reads as two stacked bars rather than one bar drawn
 * over another. Being double-booked is exactly the thing this screen
 * should make obvious, not hide.
 */
function packLanes<T extends { startDate: string; endDate: string }>(
  bookings: T[],
): { booking: T; lane: number }[] {
  const laneEnds: number[] = [];
  return [...bookings]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((booking) => {
      const start = days(booking.startDate);
      let lane = laneEnds.findIndex((end) => end < start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = days(booking.endDate);
      return { booking, lane };
    });
}

export function DomainResourceBoard({
  resources,
}: {
  resources: BoardResource[];
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string>("");
  const [only, setOnly] = useState<"all" | "free" | "booked">("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources
      .filter((r) => {
        if (only === "free" && r.status !== "Free") return false;
        if (only === "booked" && r.status === "Free") return false;
        if (role && r.role !== role) return false;
        if (q && !r.name.toLowerCase().includes(q)) return false;
        return true;
      })
      // Free people first, then whoever frees up soonest: the order you
      // read in when you are looking for somebody to take work.
      .sort((a, b) => {
        const af = a.status === "Free" ? 0 : 1;
        const bf = b.status === "Free" ? 0 : 1;
        if (af !== bf) return af - bf;
        return (a.availableFrom ?? "").localeCompare(b.availableFrom ?? "");
      });
  }, [resources, query, role, only]);

  /**
   * One axis for everyone, spanning every booking on screen.
   *
   * Per-row scaling would make a two-week booking and a six-month one
   * look identical, which is precisely the comparison this screen exists
   * to make.
   */
  const axis = useMemo(() => {
    const today = todays();
    const all = shown.flatMap((r) => r.projects);
    const starts = all.map((p) => days(p.startDate));
    const ends = all.map((p) => days(p.endDate));
    // A few days of lead-in before the earliest thing on the chart. With
    // no lead-in, a portfolio where nothing started before today puts
    // today at 0% — and the "today" caption then prints straight on top
    // of the start-date label.
    const LEAD_IN = 5;
    const from = Math.min(today - LEAD_IN, ...(starts.length ? starts : [today]));
    const to = Math.max(today + 30, ...(ends.length ? ends : [today + 30]));
    return { from, to, span: Math.max(1, to - from) };
  }, [shown]);

  const pct = (iso: string) => ((days(iso) - axis.from) / axis.span) * 100;
  const todayPct = Math.min(
    100,
    Math.max(0, ((todays() - axis.from) / axis.span) * 100),
  );

  /**
   * "Free" means no booking AND nothing outstanding — the definition the
   * API and this page's summary cards already use. Counting only open
   * tags would call someone available while a booking bar runs straight
   * through today, and put a different number in the filter than in the
   * card above it.
   */
  const freeCount = resources.filter((r) => r.status === "Free").length;

  /** projectId -> colour, assigned once in a stable order. */
  const colourOf = useMemo(() => {
    const seen: { id: number; name: string }[] = [];
    const known = new Set<number>();
    for (const r of resources) {
      for (const pr of r.projects) {
        if (!known.has(pr.projectId)) {
          known.add(pr.projectId);
          seen.push({ id: pr.projectId, name: pr.projectName });
        }
      }
    }
    seen.sort((a, b) => a.name.localeCompare(b.name));
    const map = new Map<number, (typeof BAND)[number]>();
    seen.forEach((pr, i) => map.set(pr.id, BAND[i % BAND.length]));
    return { map, list: seen };
  }, [resources]);

  const roles = useMemo(
    () =>
      TAG_HOLDER_ROLES.filter((r) => resources.some((x) => x.role === r)),
    [resources],
  );

  return (
    <div className="card p-5">
      {/* ---- filters ------------------------------------------------ */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="flex items-center gap-1">
          {(
            [
              ["all", `Everyone ${resources.length}`],
              ["free", `Free now ${freeCount}`],
              ["booked", `Booked ${resources.length - freeCount}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setOnly(key)}
              className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
                only === key
                  ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                  : "bg-white text-ink-600 border-ink-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={selectClass("sm")}
          aria-label="Role"
        >
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {DOMAIN_ROLE_LABELS[r as DomainRole] ?? r}
            </option>
          ))}
        </select>

        <label className="relative ml-auto">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person"
            className="pl-8 pr-2.5 py-1.5 rounded border border-ink-200 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </label>
      </div>

      {/* ---- which colour is which project --------------------------- */}
      {colourOf.list.length > 0 && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mb-3 text-[11px] text-ink-600">
          {colourOf.list.map((pr) => (
            <span key={pr.id} className="inline-flex items-center gap-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-sm ${colourOf.map.get(pr.id)?.dot}`}
              />
              {pr.name}
            </span>
          ))}
        </div>
      )}

      {/* ---- the axis, stated once ---------------------------------- */}
      <div className="hidden sm:grid grid-cols-[200px_1fr_92px] gap-3 items-end pb-1.5 border-b border-ink-200 text-[11px] text-ink-500">
        <span className="font-semibold uppercase tracking-wide">Person</span>
        <span className="relative h-4">
          <span className="absolute left-0">{fmtDate(isoOf(axis.from))}</span>
          {/* Only when it has room. The lead-in above keeps today off the
              left edge in the normal case, but a chart spanning a year of
              past bookings can still push it hard against the right one —
              and the vertical line marks today whether this caption is
              drawn or not. */}
          {todayPct > 12 && todayPct < 88 && (
            <span
              className="absolute -translate-x-1/2 font-medium text-ink-700"
              style={{ left: `${todayPct}%` }}
            >
              today
            </span>
          )}
          <span className="absolute right-0">{fmtDate(isoOf(axis.to))}</span>
        </span>
        <span className="font-semibold uppercase tracking-wide text-right">
          Free from
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-400 italic py-6">Nobody matches that.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {shown.map((r) => {
            const free = r.status === "Free";
            const packed = packLanes(r.projects);
            const laneCount = Math.max(1, ...packed.map((x) => x.lane + 1));
            return (
              <li
                key={r.id}
                className="grid sm:grid-cols-[200px_1fr_92px] gap-2 sm:gap-3 items-center py-2.5"
              >
                {/* who */}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-900 truncate">
                    {r.name}
                  </div>
                  <div className="text-[11px] text-ink-500 truncate">
                    {DOMAIN_ROLE_LABELS[r.role as DomainRole] ?? r.role}
                    {r.openTags > 0 && <> · {r.openTags} tags open</>}
                    {laneCount > 1 && (
                      <span className="text-brand-yellowText font-medium">
                        {" "}
                        · {laneCount} at once
                      </span>
                    )}
                  </div>
                </div>

                {/* when they are booked */}
                <div
                  className="relative"
                  style={{ height: `${18 + laneCount * 10}px` }}
                >
                  {/* the whole window, as ground */}
                  <div className="absolute inset-x-0 top-2 h-1.5 rounded-pill bg-ink-100" />

                  {packed.map(({ booking: bk, lane }) => {
                    const left = Math.max(0, pct(bk.startDate));
                    const right = Math.min(100, pct(bk.endDate));
                    const width = Math.max(1.5, right - left);
                    const done =
                      bk.assignedTags > 0
                        ? (bk.deliveredTags / bk.assignedTags) * 100
                        : 0;
                    const colour = colourOf.map.get(bk.projectId) ?? BAND[0];
                    return (
                      <div
                        key={`${bk.projectId}-${bk.startDate}-${lane}`}
                        className={`absolute h-2.5 rounded-pill overflow-hidden ${colour.bar}`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          top: `${4 + lane * 10}px`,
                        }}
                        title={`${bk.projectName} · ${fmtDate(bk.startDate)} to ${fmtDate(bk.endDate)} · ${bk.deliveredTags}/${bk.assignedTags} tags`}
                      >
                        {/* Work still outstanding on this booking, drawn
                            inside it — one nearly finished should not look
                            like one just begun. */}
                        <div
                          className="h-full bg-white/50"
                          style={{ marginLeft: `${done}%`, width: `${100 - done}%` }}
                        />
                      </div>
                    );
                  })}

                  {/* today, straight down every row */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-ink-400"
                    style={{ left: `${todayPct}%` }}
                  />

                  {free && (
                    <span className="absolute left-0 top-0 text-[11px] text-brand-greenText font-medium">
                      available now
                    </span>
                  )}
                </div>

                {/* when they come free */}
                <div className="text-right">
                  {free ? (
                    <span className="inline-block px-2 py-0.5 rounded-pill text-[11px] font-semibold bg-brand-greenBg text-brand-greenText">
                      Free
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-ink-900 tabular-nums">
                      {r.availableFrom ? fmtDate(r.availableFrom) : "—"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-400 mt-3">
        Each bar is one booking, coloured by project and drawn on a shared
        timeline; the pale part of a bar is work still outstanding. Stacked
        bars mean two projects at once, and a gap means nothing is booked
        then. Hover a bar for its dates.
      </p>
    </div>
  );
}

/** The last release across a set — when the whole group is free. */
export function allFreeFrom(rows: { availableFrom: string | null }[]): string | null {
  const dates = rows.map((r) => r.availableFrom).filter((d): d is string => !!d);
  return dates.length === 0 ? null : dates.reduce((max, d) => (d > max ? d : max));
}

/** The first upcoming release across a set — who frees up soonest. */
export function nextFreeFrom(rows: { availableFrom: string | null }[]): string | null {
  const dates = rows.map((r) => r.availableFrom).filter((d): d is string => !!d);
  return dates.length === 0 ? null : dates.reduce((min, d) => (d < min ? d : min));
}

function todays(): number {
  return days(todayISO());
}

function isoOf(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}
