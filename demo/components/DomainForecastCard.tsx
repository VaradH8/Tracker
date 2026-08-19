"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Users,
} from "lucide-react";
import { DomainDeliveryLog } from "@/components/DomainDeliveryLog";
import { fmtDate as fmt, fmtDate as fmtShort } from "@/lib/domain-format";

/**
 * A project's estimate.
 *
 * Compact by default. Every project used to render its headline, four
 * large figures, a timeline, a progress bar with a four-part legend, a
 * division table and a delivery log — a full screen each, so a portfolio
 * of six projects was six screens of scrolling and no way to compare any
 * two of them.
 *
 * So the card now answers the only question a forecast review opens with
 * — will this land, and when — and keeps the evidence one click away
 * rather than deleting it. The one thing that stays visible when closed
 * is a warning that the date rests on an assumed rate: hiding that would
 * make the compact view more confident than the number deserves.
 */

export type Forecast = {
  dailyRate: number;
  workingDaysNeeded: number;
  projectedDate: string | null;
  status: "On Track" | "Behind Schedule" | "Unknown";
  slackDays: number | null;
  reason: string;
};

export type ProjectRow = {
  id: number;
  name: string;
  owner: string;
  client?: string | null;
  startDate: string | null;
  handoverDate: string | null;
  totalTags: number;
  assignedTags: number;
  deliveredTags: number;
  remainingTags: number;
  pendingApprovalTags: number;
  peopleEngaged: number;
  divisions: {
    id: number;
    name: string;
    totalTags: number;
    assignedTags: number;
    deliveredTags: number;
  }[];
  resources: {
    id: string;
    name: string;
    rate: number;
    fullRate: number;
    concurrentProjects: number;
    usingDefaultRate: boolean;
  }[];
  startsFrom: string;
  forecast: Forecast;
};



export function statusTone(s: string) {
  if (s === "On Track") {
    return {
      chip: "bg-brand-greenBg text-brand-greenText",
      bar: "bg-brand-green",
      text: "text-brand-greenText",
      rail: "border-brand-green",
    };
  }
  if (s === "Behind Schedule") {
    return {
      chip: "bg-brand-redBg text-brand-redText",
      bar: "bg-brand-red",
      text: "text-brand-redText",
      rail: "border-brand-red",
    };
  }
  return {
    chip: "bg-ink-100 text-ink-500",
    bar: "bg-ink-400",
    text: "text-ink-500",
    rail: "border-ink-200",
  };
}

const DAY = 86400000;
const days = (iso: string) => new Date(iso + "T00:00:00Z").getTime();

/**
 * Start → projected, with the handover date marked on the same scale, so
 * "we land three weeks late" is a picture rather than a number to work out.
 */
function Timeline({ p }: { p: ProjectRow }) {
  const start = p.startDate ?? p.startsFrom;
  const handover = p.handoverDate;
  const projected = p.forecast.projectedDate;
  if (!handover || !projected) return null;

  const t0 = days(start);
  const tEnd = Math.max(days(handover), days(projected));
  const span = Math.max(1, tEnd - t0);
  const pct = (iso: string) => ((days(iso) - t0) / span) * 100;

  const handoverPct = pct(handover);
  const projectedPct = pct(projected);
  const tone = statusTone(p.forecast.status);

  const todayISO = new Date().toISOString().slice(0, 10);
  const todayPct = Math.min(100, Math.max(0, pct(todayISO)));

  // pb-5 reserves the strip the "Handover" caption occupies. The caption
  // is absolutely positioned so it can sit under its marker, which means
  // it takes no height of its own — without this the verdict line below
  // rides up into it.
  return (
    <div className="mt-5 pb-5">
      <div className="flex items-center justify-between text-[11px] text-ink-500 mb-1.5">
        <span>{fmtShort(start)}</span>
        <span className="uppercase tracking-wide">Delivery timeline</span>
        <span>{fmtShort(tEnd === days(handover) ? handover : projected)}</span>
      </div>

      <div className="relative h-9">
        {/* the full window */}
        <div className="absolute inset-x-0 top-3 h-3 rounded-pill bg-ink-100" />

        {/* work runs from start to the projected finish */}
        <div
          className={`absolute top-3 h-3 rounded-pill ${tone.bar} opacity-80`}
          style={{ left: 0, width: `${Math.max(2, projectedPct)}%` }}
        />

        {/* where we are now */}
        <div
          className="absolute top-1.5 h-6 w-px bg-ink-400"
          style={{ left: `${todayPct}%` }}
          title={`Today — ${fmt(todayISO)}`}
        />

        {/* the promise */}
        <div
          className="absolute top-0 h-9 border-l-2 border-dashed border-ink-700"
          style={{ left: `${handoverPct}%` }}
          title={`Handover — ${fmt(handover)}`}
        />
        {/* The dashed line above marks the exact date; this label only
            names it. Its centre is pulled back from the very edges so a
            handover sitting at 0% or 100% doesn't print half outside the
            card — which it did once these cards became two-up and
            narrow. */}
        <span
          className="absolute top-full mt-0.5 text-[10px] font-medium text-ink-700 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${Math.min(88, Math.max(12, handoverPct))}%` }}
        >
          Handover
        </span>

        {/* the estimate */}
        <div
          className={`absolute top-1 h-7 w-1.5 rounded-pill ${tone.bar}`}
          style={{ left: `calc(${projectedPct}% - 3px)` }}
          title={`Projected — ${fmt(projected)}`}
        />
      </div>

    </div>
  );
}

/** One labelled date. Three of these read as a sequence; a grid of
 *  differently-styled figures does not. */
function DateCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-ink-500 font-medium uppercase tracking-wide truncate">
        {label}
      </div>
      <div
        className={`font-heading text-sm font-medium truncate ${tone ?? "text-ink-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * The headline verdict, as a number rather than a category.
 *
 * "Behind Schedule" says there is a problem; "1183 days late" says how
 * big it is — same glance, same space, and it removes the need for a
 * sentence restating it further down the card.
 */
function SlackChip({
  slack,
  tone,
}: {
  slack: number | null;
  tone: ReturnType<typeof statusTone>;
}) {
  if (slack === null) {
    return (
      <span className="px-2 py-0.5 rounded-pill text-[11px] font-semibold shrink-0 bg-ink-100 text-ink-500">
        No handover date
      </span>
    );
  }
  const late = slack < 0;
  return (
    <span
      className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold shrink-0 ${tone.chip}`}
    >
      {late ? `${Math.abs(slack)} days late` : `${slack} days spare`}
    </span>
  );
}

export function DomainForecastCard({
  p,
}: {
  p: ProjectRow;
}) {
  const [open, setOpen] = useState(false);
  const tone = statusTone(p.forecast.status);
  const pct = p.totalTags > 0 ? (p.deliveredTags / p.totalTags) * 100 : 0;
  const pendingPct =
    p.totalTags > 0
      ? Math.min(100 - pct, (p.pendingApprovalTags / p.totalTags) * 100)
      : 0;

  const noRate = p.resources.filter((r) => r.usingDefaultRate);
  const shared = p.resources.filter((r) => r.concurrentProjects > 1);
  const notStarted = p.startsFrom > new Date().toISOString().slice(0, 10);
  const hasCaveats = noRate.length > 0 || shared.length > 0 || notStarted;

  return (
    <article className={`card border-l-4 ${tone.rail} p-4`}>
      {/* --- headline ------------------------------------------------ */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold text-ink-900 truncate">
            {p.name}
          </h3>
          <p className="text-xs text-ink-500 mt-0.5 truncate">
            {p.client && (
              <>
                <span className="text-ink-700 font-medium">{p.client}</span>
                {" · "}
              </>
            )}
            {p.owner}
            {" · "}
            <span className="inline-flex items-center gap-1">
              <Users size={11} /> {p.peopleEngaged}
            </span>
          </p>
        </div>
        <SlackChip slack={p.forecast.slackDays} tone={tone} />
      </div>

      {/* --- the three dates, in the order they happen --------------- */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-ink-100">
        <DateCell label="Start" value={fmt(p.startDate ?? p.startsFrom)} />
        <DateCell label="Handover" value={fmt(p.handoverDate)} />
        {/* Only this one carries colour: it is the one that can be wrong. */}
        <DateCell
          label="Projected"
          value={fmt(p.forecast.projectedDate)}
          tone={tone.text}
        />
      </div>

      {/* --- tag delivery ------------------------------------------- */}
      <div className="mt-3 pt-3 border-t border-ink-100">
        {/* The percentage is the headline and is sized like one. Reading
            a progress bar should not require decoding three colours
            first — the number says it, the bar shows it, the sentence
            underneath explains it in words. */}
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs font-medium text-ink-700">Tag delivery</span>
          <span className="font-heading text-lg font-semibold text-ink-900 leading-none">
            {Math.round(pct)}%
          </span>
        </div>
        <div className="h-2.5 rounded-pill bg-ink-100 overflow-hidden flex">
          <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
          <div
            className="h-full bg-brand-yellow"
            style={{ width: `${pendingPct}%` }}
          />
        </div>
        {/* One sentence, in words, instead of a colour key to decode. */}
        <p className="mt-1.5 text-[11px] text-ink-500">
          <strong className="font-medium text-ink-900">
            {p.deliveredTags} of {p.totalTags}
          </strong>{" "}
          tags delivered
          {p.pendingApprovalTags > 0 && (
            <span className="text-brand-yellowText">
              {" · "}
              {p.pendingApprovalTags} awaiting sign-off
            </span>
          )}
          {p.assignedTags < p.totalTags && (
            <span className="text-brand-yellowText">
              {" · "}
              {p.totalTags - p.assignedTags} not yet assigned
            </span>
          )}
        </p>
      </div>

      {/* The timeline carries its own verdict line ("lands N days late"),
          so there is deliberately no second one above it. */}
      <Timeline p={p} />

      {/* Stays visible when closed: a date built on an assumed rate must
          not look as firm as one built on measured throughput. */}
      {hasCaveats && !open && (
        <p className="text-[11px] text-brand-yellowText mt-2 flex items-center gap-1">
          <AlertTriangle size={11} className="shrink-0" />
          {noRate.length > 0
            ? `${noRate.length} without a set rate`
            : shared.length > 0
              ? `${shared.length} splitting time across projects`
              : `Starts ${fmt(p.startsFrom)}`}
        </p>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {open ? "Hide detail" : "Detail"}
      </button>

      {!open ? null : (
        <div className="mt-1">
      {/* --- division split ------------------------------------------ */}
      {p.divisions.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead className="text-ink-500 text-xs uppercase tracking-wide border-b border-ink-200">
              <tr>
                <th className="text-left font-semibold py-2">Division</th>
                <th className="text-right font-semibold py-2">Total</th>
                <th className="text-right font-semibold py-2">Delivered</th>
                <th className="text-right font-semibold py-2">Remaining</th>
                <th className="text-right font-semibold py-2 w-32">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {p.divisions.map((d) => {
                const total = d.totalTags || d.assignedTags;
                const dp = total > 0 ? (d.deliveredTags / total) * 100 : 0;
                return (
                  <tr key={d.id}>
                    <td className="py-2 text-ink-900 font-medium">{d.name}</td>
                    <td className="py-2 text-right text-ink-700">{total}</td>
                    <td className="py-2 text-right text-brand-greenText font-semibold">
                      {d.deliveredTags}
                    </td>
                    <td className="py-2 text-right text-ink-700">
                      {Math.max(0, total - d.deliveredTags)}
                    </td>
                    <td className="py-2 pl-4">
                      <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden">
                        <div
                          className="h-full bg-brand-green"
                          style={{ width: `${dp}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- caveats worth saying out loud in a review ---------------- */}
      {hasCaveats && (
        <div className="mt-4 text-xs space-y-1">
          {notStarted && (
            <p className="text-ink-500">
              Counted from <strong>{fmt(p.startsFrom)}</strong>, when the first
              resource starts.
            </p>
          )}
          {/* Name the people instead of quoting the fallback figure: the
              fix is to set their rate, not to know what was assumed. */}
          {noRate.length > 0 && (
            <p className="text-brand-yellowText">
              <strong>No rate set:</strong>{" "}
              {noRate.map((r) => r.name).join(", ")} — set their rate on the
              project to firm this date up.
            </p>
          )}
          {shared.length > 0 && (
            <p className="text-brand-yellowText">
              <strong>Shared time:</strong>{" "}
              {shared
                .map(
                  (r) =>
                    `${r.name} ${r.rate}/day of ${r.fullRate} (across ${r.concurrentProjects})`,
                )
                .join(" · ")}
            </p>
          )}
        </div>
      )}

          <DomainDeliveryLog projectId={p.id} />
        </div>
      )}
    </article>
  );
}
