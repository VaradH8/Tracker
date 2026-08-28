"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TAG_HOLDER_ROLES, DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import { fmtDate } from "@/lib/domain-format";
import { selectClass } from "@/lib/domain-ui";
import {
  buildColumns,
  buildGrid,
  colourIndexes,
  committedShare,
  groupSpans,
  impliedBookings,
  undatedCarriedWork,
  yearsCovered,
  type Granularity,
} from "@/lib/domain-availability-bar";

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
    /** Ends the booking early; the bar stops here rather than at endDate. */
    releasedAt?: string | null;
    /** 5 or 6. Decides which Saturdays are working days on this booking. */
    workingDaysPerWeek?: number | null;
    assignedTags: number;
    deliveredTags: number;
    openTags: number;
  }[];
  /**
   * Projects they hold undelivered tags on with no booking behind them.
   * Drawn on the bar as carried work: it is real commitment, and leaving
   * it out drew somebody on two projects as half free.
   */
  openTagProjects?: {
    projectId: number;
    projectName: string;
    openTags: number;
    startDate: string | null;
    handoverDate: string | null;
    workingDaysPerWeek: number | null;
  }[];
};

/**
 * Carried work is drawn in its project's colour but hatched, so it reads
 * as commitment without being mistaken for a booking. Same hue answers
 * "which job"; the texture answers "is this actually booked".
 */
const CARRIED_HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 3px, rgba(255,255,255,0) 3px 6px)",
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
/**
 * A colour per project, and none of them a traffic light.
 *
 * These used to come from the app's own palette, which meant red and amber
 * bars — and red means "late" on every other screen here, so a bar that
 * only meant "the fourth project alphabetically" read as an alarm.
 *
 * Deliberately outside that vocabulary now: blues, purples, teals. Green
 * is not among them either, because green has a job on this chart — it
 * means free. Nine, and they wrap, which is why the key above the chart is
 * not optional.
 */
const PROJECT_COLOURS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
  "bg-cyan-600",
  "bg-purple-600",
  "bg-blue-700",
  "bg-rose-400",
];
/** Working time with nothing against it — what the screen is for. */
const FREE_COLOUR = "bg-brand-green";


export function DomainResourceBoard({
  resources,
}: {
  resources: BoardResource[];
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string>("");
  const [project, setProject] = useState<string>("");
  const [only, setOnly] = useState<"all" | "free" | "booked">("all");
  const [mode, setMode] = useState<Granularity>("week");
  const [year, setYear] = useState<number>(() =>
    new Date().getUTCFullYear(),
  );

  /** Every booking on the board, carried work folded in. */
  const allBookings = useMemo(
    () =>
      resources.flatMap((r) => [
        ...r.projects,
        ...impliedBookings(r.openTagProjects ?? [], todays()),
      ]),
    [resources],
  );

  /** The years the data actually touches — the year picker offers no more. */
  const years = useMemo(
    () => yearsCovered(allBookings, todays()),
    [allBookings],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wanted = project ? Number(project) : null;
    return resources
      .filter((r) => {
        if (only === "free" && r.status !== "Free") return false;
        if (only === "booked" && r.status === "Free") return false;
        if (role && r.role !== role) return false;
        if (q && !r.name.toLowerCase().includes(q)) return false;
        if (wanted !== null) {
          const on = [
            ...r.projects.map((p) => p.projectId),
            ...(r.openTagProjects ?? []).map((p) => p.projectId),
          ];
          if (!on.includes(wanted)) return false;
        }
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
  }, [resources, query, role, project, only]);

  /**
   * The columns, derived once for the whole chart.
   *
   * Shared by the header and every row: a column is only a column if it
   * means the same thing on each line, and per-row columns would each get
   * their own working-day total.
   */
  const columns = useMemo(
    () => buildColumns(mode, year, allBookings, years),
    [mode, year, allBookings, years],
  );
  const groups = useMemo(() => groupSpans(columns), [columns]);

  /**
   * Which week numbers get printed. Every column carries its own label, but
   * fifty-two of them collide into a grey smear — so one in four is drawn
   * and the rest are reachable by hovering the cell.
   */
  const labelEvery = mode === "week" ? 4 : 1;

  /** One colour per project across the whole chart, so the same job reads
   *  the same on every row. */
  const colourOf = useMemo(() => {
    // Carried work included, or a project somebody holds tags on without a
    // booking would be drawn on the grid and missing from the key.
    const bookings = resources.flatMap((r) => [
      ...r.projects,
      ...(r.openTagProjects ?? []),
    ]);
    const index = colourIndexes(bookings);
    const names = new Map<number, string>();
    for (const b of bookings) names.set(b.projectId, b.projectName);
    return {
      colour: (id: number) =>
        PROJECT_COLOURS[(index.get(id) ?? 0) % PROJECT_COLOURS.length],
      list: Array.from(index.keys())
        .map((id: number) => ({ id, name: names.get(id) ?? "Unknown" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [resources]);

  /**
   * "Free" means no booking AND nothing outstanding — the definition the
   * API and this page's summary cards already use. Counting only open
   * tags would call someone available while a booking runs straight
   * through today, and put a different number in the filter than in the
   * card above it.
   */
  const freeCount = resources.filter((r) => r.status === "Free").length;

  const roles = useMemo(
    () =>
      TAG_HOLDER_ROLES.filter((r) => resources.some((x) => x.role === r)),
    [resources],
  );

  return (
    <div className="card p-5">
      {/* ---- filters ------------------------------------------------ */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
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
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className={selectClass("sm")}
          aria-label="Project"
        >
          <option value="">All projects</option>
          {colourOf.list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

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

        {/* Weekly reads a delivery window; yearly reads a portfolio. Same
            data, and no single slice answers both. */}
        <div className="flex items-center gap-1">
          {(
            [
              ["week", "Weekly"],
              ["month", "Monthly"],
              ["year", "Yearly"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
                mode === key
                  ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                  : "bg-white text-ink-600 border-ink-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode !== "year" && (
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={selectClass("sm")}
            aria-label="Year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}

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

      <p className="text-sm text-ink-600 mb-3">
        Today:{" "}
        <span className="font-semibold text-ink-900">
          {resources.length - freeCount} engaged
        </span>{" "}
        · <span className="font-semibold text-ink-900">{freeCount} available</span>
      </p>

      {/* ---- which colour is which ---------------------------------- */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-ink-600 mb-3">
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-sm ${FREE_COLOUR}`} />
          Free
        </span>
        {colourOf.list.map((pr) => (
          <span key={pr.id} className="inline-flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${colourOf.colour(pr.id)}`} />
            {pr.name}
          </span>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-400 italic py-6">Nobody matches that.</p>
      ) : (
        <div className="overflow-x-auto">
          {/*
            A real table, not a row of flex bars. Uniform columns and a rule
            between them are what let you read DOWN — "who is free in week
            33" — which is the question a bar could never answer.
          */}
          <table className="w-full table-fixed border-collapse text-[11px]">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="w-40 border border-ink-200 bg-ink-50 px-3 py-2 text-left text-xs font-semibold text-ink-700"
                >
                  Employee
                </th>
                {groups.map((g) => (
                  <th
                    key={g.key}
                    colSpan={g.span}
                    className="border border-ink-200 bg-ink-50 px-1 py-1 text-center font-semibold text-ink-700"
                  >
                    {g.group}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map((c, i) => (
                  <th
                    key={c.key}
                    className="border border-ink-200 bg-ink-50 px-0 py-1 text-center font-normal text-ink-500"
                    title={`${fmtDate(isoOf(c.from))} – ${fmtDate(isoOf(c.to))} · ${c.workingDays} working days`}
                  >
                    {i % labelEvery === 0 ? c.label : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const carried = r.openTagProjects ?? [];
                const bookings = [
                  ...r.projects,
                  // Tags held with no booking behind them. Without this the
                  // grid showed only formal allocations, so somebody on two
                  // projects with one unbooked read as half free.
                  ...impliedBookings(carried, todays()),
                ];
                const cells = buildGrid(columns, bookings);
                const doubled = cells
                  .flatMap((c) => c.segments)
                  .some((sg) => sg.projects.length > 1);
                const undated = undatedCarriedWork(carried, todays());
                return (
                  <tr key={r.id} className="odd:bg-white even:bg-ink-50/40">
                    <td className="border border-ink-200 px-3 py-2 align-middle">
                      <div className="truncate text-sm font-medium text-ink-900">
                        {r.name}
                      </div>
                      <div className="truncate text-[11px] text-ink-500">
                        {DOMAIN_ROLE_LABELS[r.role as DomainRole] ?? r.role}
                        {doubled && (
                          <span className="font-medium text-brand-yellowText">
                            {" "}
                            · double-booked
                          </span>
                        )}
                        {undated.length > 0 && (
                          <span
                            className="font-medium text-brand-yellowText"
                            title={`${undated
                              .map((c) => `${c.projectName} (${c.openTags} open)`)
                              .join(", ")} — no handover date set, so it cannot be placed on the grid.`}
                          >
                            {" "}
                            · {undated.length} undated
                          </span>
                        )}
                      </div>
                    </td>
                    {cells.map(({ column, segments }) => {
                      const share = committedShare(segments, column);
                      const busy = segments.filter((s) => s.kind === "busy");
                      const names = Array.from(
                        new Set(
                          busy.flatMap((s) =>
                            s.projects.map(
                              (p) =>
                                `${p.projectName}${p.implied ? " (carried)" : ""}`,
                            ),
                          ),
                        ),
                      );
                      const title =
                        share > 0
                          ? `${names.join(" + ")} · ${Math.round(share * column.workingDays)} of ${column.workingDays} working days`
                          : column.workingDays > 0
                            ? `Free · ${fmtDate(isoOf(column.from))} – ${fmtDate(isoOf(column.to))}`
                            : "No working days";
                      return (
                        <td
                          key={column.key}
                          title={title}
                          className="border border-ink-200 p-0 align-middle"
                        >
                          {/* The cell fills by how much of the column is
                              actually committed: a week booked Mon–Wed is
                              three fifths, not all of it. */}
                          <div className="flex h-8 w-full">
                            {segments.map((sg) => (
                              <div
                                key={`${sg.from}-${sg.kind}`}
                                style={{
                                  width: `${(sg.workingDays / Math.max(1, column.workingDays)) * 100}%`,
                                }}
                                className={`flex h-full flex-col ${sg.kind === "free" ? "" : ""}`}
                              >
                                {sg.projects.map((pr) => (
                                  <span
                                    key={pr.projectId}
                                    className={`flex-1 ${colourOf.colour(pr.projectId)}`}
                                    style={pr.implied ? CARRIED_HATCH : undefined}
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-400 mt-3">
        One row per person, one column per {mode === "week" ? "week" : mode === "month" ? "month" : "year"}.
        A filled cell is committed time, an empty one is free. Only working
        days count, following each project&apos;s own working week, so a week
        booked Monday to Wednesday fills three fifths of its cell. A cell
        split into bands is two projects at once.{" "}
        <span
          className="inline-block align-middle w-3 h-3 rounded-sm bg-ink-400"
          style={CARRIED_HATCH}
        />{" "}
        Hatched means tags carried on a project with no booking behind them.
        Hover any cell for its dates.
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
