"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { fmtDate, fmtWeekday } from "@/lib/domain-format";
import { selectClass } from "@/lib/domain-ui";
import { DomainRefreshButton } from "@/components/DomainRefreshButton";

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

export function DomainDeliveryByDate() {
  const [groupBy, setGroupBy] = useState<"day" | "week">("day");
  const [days, setDays] = useState(30);
  /** "" = every division, "none" = tags assigned straight to a project. */
  const [division, setDivision] = useState("");
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    const q = new URLSearchParams({ groupBy, days: String(days) });
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
  }, [groupBy, days, division, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <section className="card p-5 mb-8">
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
        <DomainRefreshButton onRefresh={load} />
      </div>

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

        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={selectClass("sm")}
          aria-label="Date range"
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>

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
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {shown.map((r) => (
                    <tr key={r.key}>
                      <td className="py-2 text-ink-900 whitespace-nowrap">
                        {groupBy === "week" ? fmtDate(r.key) : fmtWeekday(r.key)}
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
                    </tr>
                  ))}
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
