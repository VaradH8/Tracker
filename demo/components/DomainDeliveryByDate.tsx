"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { fmtDate, fmtStamp, fmtWeekday } from "@/lib/domain-format";
import { dateClass, selectClass } from "@/lib/domain-ui";

/**
 * Delivery by date — what was submitted on each day, and how much of it
 * was signed off.
 *
 * Both figures are shown side by side on purpose. Submitted alone
 * overstates delivery; approved alone hides work sitting in review. The
 * gap between the two is the thing worth looking at, so the bar draws
 * approved solid and everything still awaiting a decision hatched behind
 * it.
 */

type Row = {
  key: string;
  submitted: number;
  approved: number;
  pending: number;
  rejected: number;
  entries: number;
  people: number;
};

type Payload = {
  groupBy: "day" | "week";
  from: string;
  to: string;
  rows: Row[];
  totals: {
    submitted: number;
    approved: number;
    pending: number;
    rejected: number;
    averagePerActive: number;
    activeBuckets: number;
  };
  divisions: { id: number | null; name: string }[];
  projects: { id: number; name: string }[];
};

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

export function DomainDeliveryByDate({
  onReady,
  heading = true,
}: {
  /**
   * Hands this card's loader up to the page.
   *
   * The card has no Refresh button of its own — the page has one, and two
   * on a single screen leaves the reader guessing which covers what. It
   * still owns its own reload (the filters re-fetch), so the page borrows
   * that function rather than duplicating the request.
   */
  onReady?: (reload: () => Promise<unknown>) => void;
  /**
   * Off when this is the whole page rather than a card on one: the page
   * header already says "Delivery by date", and repeating it immediately
   * below reads as a mistake.
   */
  heading?: boolean;
} = {}) {
  const [groupBy, setGroupBy] = useState<"day" | "week">("day");
  const [days, setDays] = useState(30);
  /** Both set = an explicit window; the rolling `days` is ignored then. */
  /** Which bar is opened out. One at a time: this is a drill-down, not
   *  a second list to scroll. */
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /** "" = every division, "none" = tags assigned straight to a project. */
  const [division, setDivision] = useState("");
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    // A half-filled custom range would otherwise silently fall back to
    // the rolling window while the inputs still showed a date.
    const custom = from !== "" && to !== "";
    const q = custom
      ? new URLSearchParams({ groupBy, from, to })
      : new URLSearchParams({ groupBy, days: String(days) });
    // Returned so the shared Refresh button can await it.
    // "none" isn't a division id — it means the tags carry no division, so
    // it can't be sent as one.
    if (division && division !== "none") q.set("divisionId", division);
    if (projectId) q.set("projectId", projectId);
    return fetch(`/api/domain/forecast/delivery?${q}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("Delivery is for Leads and Admins.");
        if (!r.ok) throw new Error(`Couldn't load delivery (HTTP ${r.status}).`);
        return r.json();
      })
      .then((b: Payload) => {
        setData(b);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, [groupBy, days, from, to, division, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The open row belongs to the previous query once anything moves.
  useEffect(() => {
    setOpenKey(null);
  }, [groupBy, days, from, to, division, projectId]);

  // Re-register whenever the loader changes identity, which it does every
  // time a filter moves — otherwise the page would refresh the card using
  // yesterday's filters.
  useEffect(() => {
    onReady?.(load);
  }, [load, onReady]);

  /**
   * Rows with nothing in them are dropped from the table but counted in
   * the summary. An empty Sunday is not information worth a row each week,
   * but "6 active days out of 30" very much is.
   */
  const shown = (data?.rows ?? []).filter(
    (r) =>
      r.entries > 0 ||
      // Filtering client-side rather than server-side keeps "none" honest:
      // the division filter can legitimately empty the whole range.
      false,
  );
  const peak = Math.max(1, ...shown.map((r) => r.submitted));
  // Drives both the select and whether the pickers show.
  const custom = from !== "" && to !== "";

  return (
    <section className="card p-5 mb-8">
      {heading && (
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
              <CalendarDays size={17} className="text-brand-blue" />
              Delivery by date
            </h2>
            <p className="text-sm text-ink-500 mt-0.5">
              Tags submitted on each {groupBy === "week" ? "week" : "day"} across
              every division, and how many were signed off.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="flex items-center gap-1">
          {(["day", "week"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 rounded-pill text-xs font-medium border ${
                groupBy === g
                  ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                  : "bg-white text-ink-600 border-ink-200"
              }`}
            >
              By {g}
            </button>
          ))}
        </div>

        {/* Rolling window, or an explicit one. Picking either end
            switches to the explicit range; "Clear dates" goes back. A
            month-end review is asked about a month, which a rolling
            "last 30 days" can never answer. */}
        <select
          value={custom ? "custom" : String(days)}
          onChange={(e) => {
            if (e.target.value === "custom") {
              // Seed the pickers with the window already on screen, so
              // switching over doesn't blank the chart.
              setFrom(data?.from ?? "");
              setTo(data?.to ?? "");
              return;
            }
            setFrom("");
            setTo("");
            setDays(Number(e.target.value));
          }}
          className={selectClass("sm")}
          aria-label="Date range"
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
          <option value="custom">Custom dates…</option>
        </select>

        {custom && (
          <>
            <label className="text-xs text-ink-500 flex items-center gap-1.5">
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className={dateClass("sm")}
              />
            </label>
            <label className="text-xs text-ink-500 flex items-center gap-1.5">
              To
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className={dateClass("sm")}
              />
            </label>
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="text-xs text-ink-500 hover:text-ink-900 underline"
            >
              Clear dates
            </button>
          </>
        )}

        <select
          value={division}
          onChange={(e) => setDivision(e.target.value)}
          className={selectClass("sm")}
          aria-label="Division"
        >
          <option value="">All divisions</option>
          {(data?.divisions ?? []).map((d) => (
            <option key={String(d.id ?? "none")} value={String(d.id ?? "none")}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={selectClass("sm")}
          aria-label="Project"
        >
          <option value="">All projects</option>
          {(data?.projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {(division || projectId) && (
          <button
            onClick={() => {
              setDivision("");
              setProjectId("");
            }}
            className="text-xs text-ink-500 hover:text-ink-900 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-brand-redText border-l-4 border-brand-red pl-3 py-1">
          {error}
        </p>
      )}

      {!error && data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-5">
            <Figure label="Approved" value={data.totals.approved} tone="text-brand-greenText" />
            <Figure label="Submitted" value={data.totals.submitted} />
            <Figure
              label="Awaiting review"
              value={data.totals.pending}
              tone={data.totals.pending > 0 ? "text-brand-yellowText" : undefined}
            />
            <Figure
              label="Sent back"
              value={data.totals.rejected}
              tone={data.totals.rejected > 0 ? "text-brand-redText" : undefined}
            />
            <Figure
              label={`Avg / active ${groupBy}`}
              value={data.totals.averagePerActive}
              sub={`${data.totals.activeBuckets} with work`}
            />
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-ink-400 italic py-6 text-center">
              Nothing was submitted in this period
              {division || projectId ? " for that filter" : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[620px]">
                <thead className="text-ink-500 text-xs uppercase tracking-wide border-b border-ink-100">
                  <tr>
                    <th className="text-left font-semibold pb-2">
                      {groupBy === "week" ? "Week of" : "Date"}
                    </th>
                    <th className="text-left font-semibold pb-2 px-3 w-[38%]">
                      Delivery
                    </th>
                    <th className="text-right font-semibold pb-2 px-3">Submitted</th>
                    <th className="text-right font-semibold pb-2 px-3">Approved</th>
                    <th className="text-right font-semibold pb-2 px-3">Awaiting</th>
                    <th className="text-right font-semibold pb-2 px-3">People</th>
                    {/* Entries, not people: one person can file more than
                        once a day, and an unlabelled number sitting next to
                        "People" just reads as a second headcount. */}
                    <th className="text-right font-semibold pb-2 pl-1">Entries</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {shown.map((r) => {
                    const open = openKey === r.key;
                    return (
                    <Fragment key={r.key}>
                    <tr
                      className={`cursor-pointer ${open ? "bg-ink-50" : "hover:bg-ink-50"}`}
                      onClick={() => setOpenKey(open ? null : r.key)}
                    >
                      <td className="py-2 text-ink-900 whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenKey(open ? null : r.key);
                          }}
                          aria-expanded={open}
                          className="inline-flex items-center gap-1 hover:text-brand-blue"
                        >
                          {open ? (
                            <ChevronDown size={14} className="text-ink-400" />
                          ) : (
                            <ChevronRight size={14} className="text-ink-400" />
                          )}
                          {groupBy === "week" ? fmtDate(r.key) : fmtWeekday(r.key)}
                        </button>
                      </td>
                      <td className="py-2 px-3">
                        <div
                          className="h-2 rounded-pill bg-ink-100 overflow-hidden flex"
                          title={`${r.approved} approved · ${r.pending} awaiting · ${r.rejected} sent back`}
                        >
                          <div
                            className="h-full bg-brand-green"
                            style={{ width: `${(r.approved / peak) * 100}%` }}
                          />
                          <div
                            className="h-full bg-brand-yellow"
                            style={{ width: `${(r.pending / peak) * 100}%` }}
                          />
                          <div
                            className="h-full bg-brand-red"
                            style={{ width: `${(r.rejected / peak) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-ink-900">
                        {r.submitted}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium text-brand-greenText">
                        {r.approved}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {r.pending > 0 ? (
                          <span className="text-brand-yellowText">{r.pending}</span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-ink-600">
                        {r.people}
                      </td>
                      <td className="py-2 pl-1 text-right tabular-nums text-ink-400 text-xs">
                        {r.entries}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <DeliveryDetail
                            date={r.key}
                            groupBy={groupBy}
                            division={division}
                            projectId={projectId}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-ink-400 mt-3">
                Dated by the day the work was done, not the day it was reviewed —
                a count approved late still counts on the day it was earned.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  sub,
  tone = "text-ink-900",
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-xs text-ink-500 font-medium uppercase tracking-wide">
        {label}
      </div>
      <div className={`font-heading text-2xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-ink-400">{sub}</div>}
    </div>
  );
}

type Entry = {
  id: number;
  date: string;
  status: string;
  submitted: number;
  approved: number | null;
  note: string | null;
  person: string;
  personRole: string;
  submittedBy: string;
  submittedAt: string;
  project: string;
  division: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

const STATUS_TONE: Record<string, string> = {
  Approved: "bg-brand-greenBg text-brand-greenText",
  Pending: "bg-brand-yellowBg text-brand-yellowText",
  Rejected: "bg-brand-redBg text-brand-redText",
};

/** "Rejected" is what is stored; "Sent back" is what it means. */
function statusLabel(s: string): string {
  return s === "Rejected" ? "Sent back" : s;
}

/**
 * What one bar is actually made of: every submission behind it, whose
 * work it was, which project and division it belonged to, and who signed
 * it off.
 *
 * Loaded when the row is opened rather than with the chart. A 90-day
 * range covers thousands of submissions and almost none of them are ever
 * looked at, so fetching them all to keep one drawer instant would be
 * paying for the whole haystack to find one needle.
 */
function DeliveryDetail({
  date,
  groupBy,
  division,
  projectId,
}: {
  date: string;
  groupBy: "day" | "week";
  division: string;
  projectId: string;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ date, groupBy });
    // The chart's filters carry in, so opening a row while filtered to
    // one division doesn't suddenly show every division.
    if (division && division !== "none") q.set("divisionId", division);
    if (projectId) q.set("projectId", projectId);

    fetch(`/api/domain/forecast/delivery/detail?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "Couldn't load that day.");
        return b.entries as Entry[];
      })
      .then((e) => {
        if (live) {
          setEntries(e);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [date, groupBy, division, projectId]);

  if (error) {
    return (
      <div className="px-3 py-3 bg-ink-50 border-l-2 border-brand-red">
        <p className="text-xs text-brand-redText">{error}</p>
      </div>
    );
  }

  if (entries === null) {
    return (
      <div className="px-3 py-3 bg-ink-50">
        <p className="text-xs text-ink-500 flex items-center gap-1.5">
          <Loader2 size={13} className="animate-spin" /> Loading…
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-3 py-3 bg-ink-50">
        <p className="text-xs text-ink-400 italic">
          Nothing was submitted on this {groupBy === "week" ? "week" : "day"}.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-ink-50 border-l-2 border-brand-blue px-3 py-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="text-ink-500 uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold pb-1.5">Person</th>
              <th className="text-left font-semibold pb-1.5 px-2">Project</th>
              <th className="text-left font-semibold pb-1.5 px-2">Division</th>
              <th className="text-right font-semibold pb-1.5 px-2">Submitted</th>
              <th className="text-right font-semibold pb-1.5 px-2">Approved</th>
              <th className="text-left font-semibold pb-1.5 px-2">Status</th>
              <th className="text-left font-semibold pb-1.5 px-2">Reviewed by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/60">
            {entries.map((e) => (
              <Fragment key={e.id}>
                <tr>
                  <td className="py-1.5 text-ink-900 font-medium whitespace-nowrap">
                    {e.person}
                    {/* Nearly always the same person — worth saying only
                        when it isn't, e.g. a lead filing on someone's
                        behalf. */}
                    {e.submittedBy !== e.person && (
                      <span className="text-ink-400 font-normal">
                        {" "}
                        · filed by {e.submittedBy}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-ink-700">{e.project}</td>
                  <td className="py-1.5 px-2 text-ink-700">
                    {e.division ?? <span className="text-ink-400">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-ink-900">
                    {e.submitted}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium text-brand-greenText">
                    {e.approved ?? <span className="text-ink-300">—</span>}
                  </td>
                  <td className="py-1.5 px-2">
                    <span
                      className={`px-1.5 py-0.5 rounded-pill text-[10px] font-semibold ${STATUS_TONE[e.status] ?? ""}`}
                    >
                      {statusLabel(e.status)}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-ink-700 whitespace-nowrap">
                    {e.reviewedBy ? (
                      <>
                        {e.reviewedBy}
                        {e.reviewedAt && (
                          <span className="text-ink-400">
                            {" "}
                            · {fmtStamp(e.reviewedAt)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-400">not yet reviewed</span>
                    )}
                  </td>
                </tr>
                {/* Notes get their own line rather than a truncated cell:
                    a reason sent back is the thing worth reading. */}
                {(e.note || e.reviewNote) && (
                  <tr>
                    <td colSpan={7} className="pb-1.5 pl-1">
                      {e.note && (
                        <span className="text-ink-500 italic">“{e.note}”</span>
                      )}
                      {e.reviewNote && (
                        <span className="text-brand-redText italic">
                          {e.note ? " · " : ""}
                          Reviewer: “{e.reviewNote}”
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
