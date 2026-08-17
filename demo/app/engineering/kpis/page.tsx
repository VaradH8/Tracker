"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
} from "lucide-react";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainRefreshButton } from "@/components/DomainRefreshButton";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import { fmtDate } from "@/lib/domain-format";

/**
 * Delivery KPIs, in the order a review actually asks them:
 *
 *   1. Is the portfolio going to land?
 *   2. Who is delivering, and how reliably?
 *   3. Is review itself the bottleneck?
 *   4. Can these numbers be trusted?
 *
 * Every figure comes from approved tags — the same source the forecast
 * uses — so this page and the forecast can never disagree. The previous
 * version counted tasks and logged hours, which described a system nobody
 * manages day to day.
 */

type Person = {
  id: string;
  name: string;
  email: string;
  role: DomainRole;
  delivered30: number;
  claimed30: number;
  approvalRate: number | null;
  reworked: number;
  rejected: number;
  pending: number;
  openTags: number;
  status: "Free" | "Allocated";
};

type Reviewer = {
  id: string;
  name: string;
  reviewed: number;
  tagsApproved: number;
  medianHours: number | null;
  adjusted: number;
  rejected: number;
};

type AtRisk = {
  id: number;
  name: string;
  handoverDate: string | null;
  projectedDate: string | null;
  slackDays: number | null;
  remainingTags: number;
  peopleEngaged: number;
};

type Kpis = {
  windowDays: number;
  totals: {
    delivered30: number;
    claimed30: number;
    approvalRate: number | null;
    medianReviewHours: number | null;
    pendingCount: number;
    pendingTags: number;
    oldestPendingDays: number | null;
    projectsTotal: number;
    projectsBehind: number;
    tagsAtRisk: number;
    slackDaysWorst: number | null;
    peopleTotal: number;
    peopleFree: number;
    hours30: number;
  };
  people: Person[];
  reviewers: Reviewer[];
  atRisk: AtRisk[];
  weeks: { label: string; delivered: number; claimed: number }[];
  quality: {
    unbooked: {
      userId: string;
      name: string;
      projectId: number;
      projectName: string;
      openTags: number;
    }[];
  };
};


/** Hours read badly past a day or so; a reviewer sitting on work for
 *  three days should say "3d", not "71.4h". */
function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h * 10) / 10}h`;
  return `${Math.round(h / 24)}d`;
}

export default function KpisPage() {
  const [data, setData] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Returns the promise so the Refresh button can show it in flight.
  const load = useCallback(() => {
    return fetch("/api/domain/kpis", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("KPIs are for Admins.");
        if (!r.ok) throw new Error(`KPIs didn't load (HTTP ${r.status}).`);
        return r.json();
      })
      .then((b) => {
        setData(b);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <DomainPage width="wide">
        <PageHeader title="Delivery KPIs" />
        <div className="card p-4 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      </DomainPage>
    );
  }
  if (!data) {
    return (
      <DomainPage width="wide">
        <PageHeader title="Delivery KPIs" />
        <p className="text-sm text-ink-500">Loading…</p>
      </DomainPage>
    );
  }

  const t = data.totals;
  const qualityIssues = data.quality.unbooked.length;

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Delivery KPIs"
        description={`Everything here is counted from tags a Lead has approved, over the last ${data.windowDays} days. Approve a submission and these numbers move with it.`}
        actions={<DomainRefreshButton onRefresh={load} />}
      />

      {/* ---- 1. will it land? ------------------------------------------ */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Tile
          label={`Tags delivered · ${data.windowDays}d`}
          value={t.delivered30}
          sub={`${t.claimed30} claimed`}
          Icon={CheckCircle2}
          tone="green"
        />
        <Tile
          label="Approval rate"
          value={t.approvalRate === null ? "—" : `${t.approvalRate}%`}
          sub={
            t.approvalRate === null
              ? "nothing reviewed yet"
              : `${t.claimed30 - t.delivered30} tags not signed off`
          }
          Icon={TrendingUp}
          tone={t.approvalRate !== null && t.approvalRate < 90 ? "amber" : "blue"}
        />
        <Tile
          label="Projects behind"
          value={`${t.projectsBehind} of ${t.projectsTotal}`}
          sub={
            t.tagsAtRisk > 0 ? `${t.tagsAtRisk} tags at risk` : "nothing at risk"
          }
          Icon={AlertTriangle}
          tone={t.projectsBehind > 0 ? "red" : "green"}
        />
        <Tile
          label="Awaiting review"
          value={t.pendingCount}
          sub={
            t.pendingCount === 0
              ? "queue is clear"
              : `${t.pendingTags} tags · oldest ${t.oldestPendingDays ?? 0}d`
          }
          Icon={Clock}
          tone={t.pendingCount > 0 ? "amber" : "green"}
        />
      </section>

      {/* ---- trend ------------------------------------------------------ */}
      <Section
        title="Delivered vs claimed"
        hint="Claimed is what people reported; delivered is what was approved. A widening gap means review is rejecting or trimming more."
      >
        {data.weeks.every((w) => w.claimed === 0) ? (
          <Empty>No submissions in this period yet.</Empty>
        ) : (
          <TrendChart weeks={data.weeks} />
        )}
      </Section>

      {/* ---- 2. who is delivering --------------------------------------- */}
      <Section
        title="Per person"
        hint={`Approval rate is approved ÷ claimed. "Trimmed" counts the times a Lead signed off fewer tags than were claimed.`}
      >
        {data.people.length === 0 ? (
          <Empty>Nobody is set up to hold tags yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-ink-500 text-xs uppercase tracking-wide border-b border-ink-100">
                <tr>
                  <th className="text-left font-semibold pb-2">Person</th>
                  <th className="text-right font-semibold pb-2 px-3">Delivered</th>
                  <th className="text-right font-semibold pb-2 px-3">Claimed</th>
                  <th className="text-right font-semibold pb-2 px-3">Approval</th>
                  <th className="text-right font-semibold pb-2 px-3">Trimmed</th>
                  <th className="text-right font-semibold pb-2 px-3">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {[...data.people]
                  .sort((a, b) => b.delivered30 - a.delivered30)
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="py-2">
                        <div className="font-medium text-ink-900">{p.name}</div>
                        <div className="text-xs text-ink-500">
                          {DOMAIN_ROLE_LABELS[p.role] ?? p.role}
                          {p.pending > 0 && (
                            <span className="text-brand-yellowText">
                              {" "}
                              · {p.pending} awaiting review
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-brand-greenText tabular-nums">
                        {p.delivered30}
                      </td>
                      <td className="py-2 px-3 text-right text-ink-700 tabular-nums">
                        {p.claimed30}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {p.approvalRate === null ? (
                          <span className="text-ink-400">—</span>
                        ) : (
                          <span
                            className={
                              p.approvalRate < 90
                                ? "text-brand-yellowText font-medium"
                                : "text-ink-700"
                            }
                          >
                            {p.approvalRate}%
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        <span
                          className={
                            p.reworked > 0 ? "text-brand-yellowText" : "text-ink-400"
                          }
                        >
                          {p.reworked}
                        </span>
                        {p.rejected > 0 && (
                          <span className="text-brand-redText">
                            {" "}
                            · {p.rejected} rej
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-ink-700">
                        {p.openTags}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ---- 3. is review the bottleneck? ------------------------------- */}
      <Section
        title="Review turnaround"
        hint="Time from a claim being filed to a Lead deciding it. This measures approvers — a slow one holds up everyone's delivery."
      >
        {data.reviewers.length === 0 ? (
          <Empty>Nothing has been reviewed in this period.</Empty>
        ) : (
          <>
            <p className="text-sm text-ink-600 mb-3">
              Median across all reviews:{" "}
              <strong className="text-ink-900">
                {fmtHours(t.medianReviewHours)}
              </strong>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="text-ink-500 text-xs uppercase tracking-wide border-b border-ink-100">
                  <tr>
                    <th className="text-left font-semibold pb-2">Reviewer</th>
                    <th className="text-right font-semibold pb-2 px-3">Reviewed</th>
                    <th className="text-right font-semibold pb-2 px-3">
                      Tags approved
                    </th>
                    <th className="text-right font-semibold pb-2 px-3">
                      Median time
                    </th>
                    <th className="text-right font-semibold pb-2 px-3">Adjusted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.reviewers.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-medium text-ink-900">{r.name}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-ink-700">
                        {r.reviewed}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-brand-greenText font-semibold">
                        {r.tagsApproved}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        <span
                          className={
                            (r.medianHours ?? 0) > 24
                              ? "text-brand-yellowText font-medium"
                              : "text-ink-700"
                          }
                        >
                          {fmtHours(r.medianHours)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-ink-700">
                        {r.adjusted}
                        {r.rejected > 0 && (
                          <span className="text-brand-redText">
                            {" "}
                            · {r.rejected} rej
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ---- at-risk projects ------------------------------------------- */}
      {data.atRisk.length > 0 && (
        <Section
          title="Projects behind schedule"
          hint="Projected finish is past the promised handover, at the current approved rate."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="text-ink-500 text-xs uppercase tracking-wide border-b border-ink-100">
                <tr>
                  <th className="text-left font-semibold pb-2">Project</th>
                  <th className="text-right font-semibold pb-2 px-3">Late by</th>
                  <th className="text-left font-semibold pb-2 px-3">Handover</th>
                  <th className="text-left font-semibold pb-2 px-3">Projected</th>
                  <th className="text-right font-semibold pb-2 px-3">Remaining</th>
                  <th className="text-right font-semibold pb-2 px-3">People</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.atRisk.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 font-medium text-ink-900">{p.name}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-brand-redText font-semibold">
                      {Math.abs(p.slackDays ?? 0)}d
                    </td>
                    <td className="py-2 px-3 text-ink-700 whitespace-nowrap">
                      {fmtDate(p.handoverDate)}
                    </td>
                    <td className="py-2 px-3 text-brand-redText whitespace-nowrap">
                      {fmtDate(p.projectedDate)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-ink-700">
                      {p.remainingTags}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-ink-700">
                      {p.peopleEngaged}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ---- 4. can the numbers be trusted? ----------------------------- */}
      <Section
        title="Data quality"
        hint="Gaps that quietly distort everything above. Neither blocks anything — both weaken the forecast."
      >
        {qualityIssues === 0 ? (
          <p className="text-sm text-brand-greenText inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Nothing to flag — every tag holder is
            booked, and every booking has a rate.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            <QualityList
              title="Holding tags with no booking"
              note="No allocation window, so the forecast has no dates to plan their work across."
              rows={data.quality.unbooked.map((u) => ({
                key: `${u.userId}-${u.projectId}`,
                text: `${u.name} · ${u.projectName}`,
                extra: `${u.openTags} open`,
              }))}
            />
            {/* "Booked with no tags/day set" was removed with the rest of
                the average-tags reporting. Rates are set and read in the
                Projects section now, so a KPI nagging about them here sent
                people to a screen that no longer holds the control. */}
          </div>
        )}
      </Section>

      <p className="text-xs text-ink-400 mt-6">
        {t.peopleFree} of {t.peopleTotal} people free · {t.hours30}h logged in
        the last {data.windowDays} days.
      </p>
    </DomainPage>
  );
}

/* ------------------------------------------------------------------ */

const TONES = {
  blue: "bg-brand-blueBg text-brand-blue",
  green: "bg-brand-greenBg text-brand-greenText",
  red: "bg-brand-redBg text-brand-redText",
  amber: "bg-brand-yellowBg text-brand-yellowText",
} as const;

function Tile({
  label,
  value,
  sub,
  Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  Icon: typeof Users;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span
          className={`w-9 h-9 rounded grid place-items-center shrink-0 ${TONES[tone]}`}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-xs text-ink-500 font-medium uppercase tracking-wide">
            {label}
          </div>
          <div className="font-heading text-2xl font-semibold text-ink-900 mt-0.5">
            {value}
          </div>
          {sub && <div className="text-xs text-ink-500 mt-0.5">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 mb-6">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {hint && <p className="text-xs text-ink-500 mt-1 mb-4">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-400 italic">{children}</p>;
}

/**
 * Claimed as the full bar, delivered as the filled portion — the gap
 * between them is the point, so they share one bar rather than sitting
 * side by side where the difference has to be worked out.
 */
function TrendChart({
  weeks,
}: {
  weeks: { label: string; delivered: number; claimed: number }[];
}) {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.claimed, w.delivered)));
  return (
    <div>
      {/* items-stretch, not items-end: the columns have to fill the row's
          height, otherwise the bar wrapper below grows into nothing and
          every percentage-height bar resolves to zero — which is exactly
          how this chart came to render its numbers with no bars. */}
      <div className="flex items-stretch gap-3 h-40">
        {weeks.map((w) => (
          <div key={w.label} className="flex-1 flex flex-col items-center gap-1 min-h-0">
            <span className="text-xs font-medium text-ink-700 tabular-nums">
              {w.delivered}
            </span>
            <div className="w-full flex-1 flex items-end min-h-0">
              <div
                className="w-full bg-ink-100 rounded-t relative"
                style={{ height: `${(w.claimed / max) * 100}%` }}
                title={`${w.claimed} claimed`}
              >
                <div
                  className="absolute bottom-0 inset-x-0 bg-brand-green rounded-t"
                  style={{
                    height: w.claimed > 0 ? `${(w.delivered / w.claimed) * 100}%` : "0%",
                  }}
                  title={`${w.delivered} approved`}
                />
              </div>
            </div>
            <span className="text-[11px] text-ink-500 whitespace-nowrap">
              {fmtDate(w.label)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-brand-green" /> Delivered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-ink-100 border border-ink-200" />{" "}
          Claimed
        </span>
      </div>
    </div>
  );
}

function QualityList({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: { key: string; text: string; extra?: string }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-ink-900">
        {title}{" "}
        <span
          className={`ml-1 px-1.5 py-0.5 rounded-pill text-[11px] ${
            rows.length > 0
              ? "bg-brand-yellowBg text-brand-yellowText"
              : "bg-brand-greenBg text-brand-greenText"
          }`}
        >
          {rows.length}
        </span>
      </h3>
      <p className="text-xs text-ink-500 mt-0.5 mb-2">{note}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-400 italic">None.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.key}
              className="text-sm text-ink-700 flex items-baseline gap-2"
            >
              <span className="truncate">{r.text}</span>
              {r.extra && (
                <span className="text-xs text-ink-500 shrink-0 ml-auto">
                  {r.extra}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
