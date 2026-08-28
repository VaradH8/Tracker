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
  impliedBookings,
  undatedCarriedWork,
  freeWorkingDays,
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
    const ends = shown.flatMap((r) => [
      ...r.projects.map((b) => days(b.releasedAt ?? b.endDate)),
      // Carried work counts: if the only thing keeping somebody busy is
      // tags with no booking, the axis still has to reach its handover or
      // the stretch is clipped off the right-hand edge.
      ...(r.openTagProjects ?? [])
        .filter((c) => c.handoverDate)
        .map((c) => days(c.handoverDate as string)),
    ]);
    // Today forward. The axis used to stretch back over every finished
    // booking, so on a busy portfolio a third of the chart was history —
    // on a screen whose only question is who is free from when. A booking
    // that started earlier simply begins at the left edge.
    const to = Math.max(today + 30, ...(ends.length ? ends : [today + 30]));
    return { from: today, to, span: Math.max(1, to - today) };
  }, [shown]);

  /**
   * The columns, derived once from every booking on screen.
   *
   * Shared by the header and every row: a column is only a column if it
   * means the same thing on each line, and per-row columns would each get
   * their own working-day total.
   */
  const columns = useMemo(() => {
    const all = shown.flatMap((r) => [
      ...r.projects,
      ...impliedBookings(r.openTagProjects ?? [], axis.from),
    ]);
    return buildColumns(axis.from, axis.to, all);
  }, [shown, axis.from, axis.to]);

  /** The chart's total width in working days — what each column divides. */
  const gridWorkingDays = useMemo(
    () => Math.max(1, columns.reduce((n, c) => n + c.workingDays, 0)),
    [columns],
  );

  /** One colour per project across the whole chart, so the same job reads
   *  the same on every row. */
  const colourOf = useMemo(() => {
    // Carried work included, or a project somebody holds tags on without a
    // booking would be drawn on the bar and missing from the key.
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

      {/* ---- which colour is which ----------------------------------
          Not optional: nine hues wrap, so past the ninth project the
          colour narrows it down and this settles it.                   */}
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mb-3 text-[11px] text-ink-600">
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

      {/* ---- the columns, stated once ------------------------------- */}
      <div className="hidden sm:grid grid-cols-[200px_1fr_92px] gap-3 items-end pb-1.5 border-b border-ink-200 text-[11px] text-ink-500">
        <span className="font-semibold uppercase tracking-wide">Person</span>
        <span className="flex">
          {columns.map((c) => (
            <span
              key={c.key}
              style={{ width: `${(c.workingDays / gridWorkingDays) * 100}%` }}
              className="border-l border-ink-200 pl-1 truncate first:border-l-0 first:pl-0"
              title={`${fmtDate(isoOf(c.from))} – ${fmtDate(isoOf(c.to))} · ${c.workingDays} working days`}
            >
              {c.label}
            </span>
          ))}
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
            const carried = r.openTagProjects ?? [];
            const bookings = [
              ...r.projects,
              // Tags held with no booking behind them. Without this the grid
              // showed only formal allocations, so somebody on two projects
              // with one of them unbooked read as half free.
              ...impliedBookings(carried, axis.from),
            ];
            /**
             * The row, column by column. Each cell is rebuilt from the
             * bookings rather than sliced out of a whole-window run, so a
             * stretch crossing a boundary stops at it instead of drawing
             * into its neighbour.
             */
            const cells = buildGrid(columns, bookings);
            const allSegments = cells.flatMap((c) => c.segments);
            const freeDays = freeWorkingDays(allSegments);
            const doubled = allSegments.some((sg) => sg.projects.length > 1);
            // Carried work whose project never set a handover date. There is
            // no honest column to put it in, so it is named on the row.
            const undated = undatedCarriedWork(carried, axis.from);
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
                    {doubled && (
                      <span className="text-brand-yellowText font-medium">
                        {" "}
                        · double-booked
                      </span>
                    )}
                    {undated.length > 0 && (
                      <span
                        className="text-brand-yellowText font-medium"
                        title={`${undated
                          .map((c) => `${c.projectName} (${c.openTags} open)`)
                          .join(", ")} — no handover date set, so it cannot be placed on the grid.`}
                      >
                        {" "}
                        · {undated.length} undated
                      </span>
                    )}
                  </div>
                </div>

                {/*
                  One cell per column, divided by a rule you can follow down
                  the page. Reading across is still "how loaded is this
                  person"; reading down a column — the thing a single bar
                  could never answer — is "who is free that week".
                */}
                <div
                  className="flex h-5"
                  role="img"
                  aria-label={
                    freeDays > 0
                      ? `${freeDays} working days free before ${fmtDate(isoOf(axis.to))}`
                      : "fully booked in this window"
                  }
                >
                  {cells.map(({ column, segments }) => (
                    <div
                      key={column.key}
                      style={{
                        width: `${(column.workingDays / gridWorkingDays) * 100}%`,
                      }}
                      className="flex border-l border-ink-200 first:border-l-0"
                    >
                      {segments.map((sg) => {
                        const dates = `${fmtDate(isoOf(sg.from))} – ${fmtDate(isoOf(sg.to))}`;
                        const days = `${sg.workingDays} working day${sg.workingDays === 1 ? "" : "s"}`;
                        const title =
                          sg.kind === "busy"
                            ? `${sg.projects
                                .map(
                                  (x) =>
                                    `${x.projectName}${x.implied ? " (tags carried, not booked)" : ""}`,
                                )
                                .join(" + ")} · ${dates} · ${days}`
                            : `Free · ${dates} · ${days}`;
                        return (
                          <div
                            key={`${sg.from}-${sg.kind}`}
                            title={title}
                            style={{
                              width: `${(sg.workingDays / column.workingDays) * 100}%`,
                            }}
                            className={`h-full flex flex-col ${sg.kind === "free" ? FREE_COLOUR : ""}`}
                          >
                            {/* Two projects on the same day splits the cell
                                into bands rather than picking a winner. */}
                            {sg.projects.map((pr) => (
                              <span
                                key={pr.projectId}
                                className={`flex-1 ${colourOf.colour(pr.projectId)}`}
                                style={pr.implied ? CARRIED_HATCH : undefined}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* when they come free */}
                <div className="text-right">
                  {free ? (
                    <span className="inline-block px-2 py-0.5 rounded-pill text-[11px] font-semibold bg-brand-greenBg text-brand-greenText">
                      Free
                    </span>
                  ) : (
                    <>
                      <span className="block text-xs font-medium text-ink-900 tabular-nums">
                        {r.availableFrom ? fmtDate(r.availableFrom) : "—"}
                      </span>
                      {/* Free time inside the window, not just the day the
                          last booking ends — somebody booked in March with
                          a clear February is available now, and the date
                          alone hides that. */}
                      {freeDays > 0 && (
                        <span className="block text-[11px] text-brand-greenText">
                          {freeDays}d free
                        </span>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-400 mt-3">
        One row per person, from today onwards, split into columns you can
        read down: coloured where they are committed, green where they are
        free. Only working days are counted, following each project&apos;s own
        working week, so a column&apos;s width is the working time it covers. A
        cell split into bands is two projects at once.{" "}
        <span
          className="inline-block align-middle w-3 h-3 rounded-sm bg-ink-400"
          style={CARRIED_HATCH}
        />{" "}
        Hatched means tags carried on a project with no booking behind them —
        real work, placed over the project&apos;s own dates. Hover any cell for
        its dates.
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
