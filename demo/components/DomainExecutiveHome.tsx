"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Gauge,
  TrendingUp,
  Users,
} from "lucide-react";
import { fmtDate } from "@/lib/domain-format";
import { allFreeFrom, nextFreeFrom } from "@/components/DomainResourceBoard";

/**
 * The executive view.
 *
 * Built around one question — will the work land, and if not, where is it
 * stuck — and ruthless about everything else. A CEO does not approve a
 * tag, log an hour or reset a password, so none of that appears here —
 * including the vocabulary of it. Work is delivered or it is pending;
 * whose signature is outstanding is somebody else's screen.
 * What does appear is either a number they would act on, or a way into
 * the screen that explains it.
 *
 * Three things, in the order they get asked:
 *
 *   1. Is the portfolio on track?  — the four figures at the top
 *   2. Which project is in trouble, and how far?  — the project list
 *   3. Have we got the people?  — who is busy, and when they come free
 *
 * Every figure is computed from work that has actually cleared. Nothing is
 * a manual status field somebody remembered to update, which is the usual
 * reason an executive dashboard drifts away from reality.
 */

type Forecast = {
  dailyRate: number;
  workingDaysNeeded: number;
  projectedDate: string | null;
  status: "On Track" | "Behind Schedule" | "Yet to be started" | "Unknown";
  slackDays: number | null;
};

type Project = {
  id: number;
  name: string;
  client?: string | null;
  owner: string;
  handoverDate: string | null;
  totalTags: number;
  assignedTags: number;
  deliveredTags: number;
  pendingApprovalTags: number;
  remainingTags: number;
  peopleEngaged: number;
  forecast: Forecast;
  resources: { id: string; name: string; usingDefaultRate: boolean }[];
};

type Resource = {
  id: string;
  name: string;
  role: string;
  status: string;
  openTags: number;
  availableFrom: string | null;
  projects: {
    projectName: string;
    startDate: string;
    endDate: string;
    openTags: number;
  }[];
};

export function DomainExecutiveHome() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    return Promise.all([
      fetch("/api/domain/forecast", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Couldn't load the forecast.")),
      ),
      fetch("/api/domain/resources/availability", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Couldn't load resources.")),
      ),
    ])
      .then(([f, a]) => {
        setProjects(f.projects ?? []);
        setResources(a.resources ?? []);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="card p-4 border-l-4 border-brand-red">
        <p className="text-sm text-brand-redText">{error}</p>
      </div>
    );
  }

  if (!loaded) {
    return <p className="text-sm text-ink-400">Loading the portfolio…</p>;
  }

  if (projects.length === 0) {
    return <p className="text-sm text-ink-400 italic">No projects yet.</p>;
  }

  const late = projects.filter((p) => (p.forecast.slackDays ?? 0) < 0);
  const behind = projects.filter((p) => p.forecast.status === "Behind Schedule");
  const totalTags = projects.reduce((s, p) => s + p.totalTags, 0);
  const delivered = projects.reduce((s, p) => s + p.deliveredTags, 0);
  const pending = projects.reduce((s, p) => s + p.pendingApprovalTags, 0);
  const people = new Set<string>();
  projects.forEach((p) => p.resources.forEach((r) => people.add(r.id)));

  // Sorted worst-first: a review should open on the problem, and a CEO
  // reads the top of a list far more often than the bottom.
  const ranked = [...projects].sort(
    (a, b) =>
      (a.forecast.slackDays ?? Number.POSITIVE_INFINITY) -
      (b.forecast.slackDays ?? Number.POSITIVE_INFINITY),
  );

  /**
   * Free first, then whoever frees up soonest — the order you read in
   * when the question is "who can take this on".
   */
  const freeNow = resources.filter((r) => r.status === "Free");
  const booked = resources.filter((r) => r.status !== "Free");
  const ordered = [...resources].sort((a, b) => {
    const af = a.status === "Free" ? 0 : 1;
    const bf = b.status === "Free" ? 0 : 1;
    if (af !== bf) return af - bf;
    return (a.availableFrom ?? "").localeCompare(b.availableFrom ?? "");
  });
  const nextFree = nextFreeFrom(booked);
  const allFree = allFreeFrom(booked);

  /**
   * One timeline for everybody, so a bar can be compared with the row
   * above it. Padded before today so the marker is never pinned to the
   * left edge.
   */
  const DAY_MS = 86400000;
  const dayOf = (iso: string) =>
    Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / DAY_MS);
  const today = Math.floor(Date.now() / DAY_MS);
  const bookings = resources.flatMap((r) => r.projects);
  const axisFrom = Math.min(
    today - 5,
    ...(bookings.length ? bookings.map((b) => dayOf(b.startDate)) : [today]),
  );
  const axisTo = Math.max(
    today + 30,
    ...(bookings.length ? bookings.map((b) => dayOf(b.endDate)) : [today + 30]),
  );
  const axisSpan = Math.max(1, axisTo - axisFrom);
  const axisPct = (iso: string) => ((dayOf(iso) - axisFrom) / axisSpan) * 100;
  const todayPct = ((today - axisFrom) / axisSpan) * 100;

  return (
    <div className="grid gap-5">
      {/* ---- 1. is the portfolio on track ------------------------- */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Headline
          label="Active projects"
          value={projects.length}
          href="/engineering/projects"
        />
        <Headline
          label="Behind schedule"
          value={behind.length}
          tone={behind.length > 0 ? "warn" : "ok"}
          href="/engineering/forecast"
        />
        <Headline
          label="Will miss handover"
          value={late.length}
          tone={late.length > 0 ? "late" : "ok"}
          href="/engineering/forecast"
        />
        <Headline
          label="People engaged"
          value={people.size}
          href="/engineering/availability"
        />
      </section>

      {/* Portfolio delivery as one bar.
          Delivered and pending are drawn apart, and only delivered counts
          towards the figure: work somebody has claimed but that has not
          cleared review is not delivery, and showing it as such would
          overstate the book to the one person least able to check it. */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h2 className="font-heading text-base font-semibold">
            Portfolio delivery
          </h2>
          <span className="text-sm text-ink-500">
            <strong className="text-brand-greenText">{delivered}</strong> of{" "}
            <strong className="text-ink-900">{totalTags}</strong> tags ·{" "}
            {totalTags > 0 ? Math.round((delivered / totalTags) * 100) : 0}%
          </span>
        </div>
        <SegmentedBar
          total={totalTags}
          delivered={delivered}
          pending={pending}
          height="h-3"
        />
        <p className="text-xs text-ink-500 mt-2">
          <Dot className="bg-brand-green" /> {delivered} delivered
          {pending > 0 && (
            <>
              {" · "}
              <Dot className="bg-brand-yellow" />
              <span className="text-brand-yellowText">{pending} pending</span>
            </>
          )}
          {" · "}
          <Dot className="bg-ink-200" />
          {Math.max(0, totalTags - delivered - pending)} remaining
        </p>
      </section>

      {/* ---- 2. which project, and how far off --------------------- */}
      <section className="card p-5">
        <SectionHead
          icon={<TrendingUp size={16} className="text-brand-blue" />}
          title="Projects, worst first"
          note="Every date computed from delivered work, not status updates."
          href="/engineering/forecast"
          linkLabel="Full forecast"
        />

        <ul className="divide-y divide-ink-100">
          {ranked.map((p) => (
            <li key={p.id}>
              {/* Straight to this project's board, not to the forecast
                  list — clicking a named thing should land on that thing.
                  The projects page reads ?project= and opens it. */}
              <Link
                href={`/engineering/projects?project=${p.id}`}
                className="grid grid-cols-1 sm:grid-cols-[1.4fr_1.6fr_auto] gap-3 sm:gap-4 items-center py-3 -mx-2 px-2 rounded hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink-900 truncate">
                    {p.name}
                  </div>
                  <div className="text-xs text-ink-500 truncate">
                    {p.client ? `${p.client} · ` : ""}
                    {p.owner} · <Users size={11} className="inline" />{" "}
                    {p.peopleEngaged}
                  </div>
                </div>

                <div className="min-w-0">
                  {/* The number leads, the bar backs it up. A reader
                      should not have to measure a bar by eye to learn
                      how far along something is. */}
                  <div className="flex items-center gap-3">
                    <span className="font-heading text-lg font-semibold text-ink-900 w-12 shrink-0 tabular-nums">
                      {p.totalTags > 0
                        ? Math.round((p.deliveredTags / p.totalTags) * 100)
                        : 0}
                      %
                    </span>
                    <span className="flex-1 min-w-0">
                      <SegmentedBar
                        total={p.totalTags}
                        delivered={p.deliveredTags}
                        pending={p.pendingApprovalTags}
                      />
                      <span className="block text-[11px] text-ink-500 mt-1 tabular-nums">
                        {p.deliveredTags} of {p.totalTags} tags delivered
                      </span>
                    </span>
                  </div>
                </div>

                <div className="text-right whitespace-nowrap">
                  <div className="text-xs font-medium text-ink-700">
                    <CalendarClock size={11} className="inline mr-0.5" />
                    {fmtDate(p.handoverDate)}
                  </div>
                  <SlackPill slack={p.forecast.slackDays} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- 3. have we got the people -----------------------------
          An overview, not a list of the six busiest names. Who is free
          is the question an executive actually acts on — it decides
          whether the answer to "can we take this on" is yes — and a
          panel that only showed loaded people could never answer it. */}
      <section className="card p-5">
        <SectionHead
          icon={<Gauge size={16} className="text-brand-blue" />}
          title="Who's free, who's booked"
          note="Bars show each booking on a shared timeline; the line is today."
          href="/engineering/availability"
          linkLabel="All resources"
        />

        <div className="flex items-baseline gap-x-6 gap-y-1 flex-wrap mb-4 text-sm">
          <span>
            <strong className="font-heading text-xl text-brand-greenText">
              {freeNow.length}
            </strong>{" "}
            <span className="text-ink-500">free now</span>
          </span>
          <span>
            <strong className="font-heading text-xl text-ink-900">
              {booked.length}
            </strong>{" "}
            <span className="text-ink-500">booked</span>
          </span>
          {nextFree && (
            <span className="text-ink-500">
              next one free{" "}
              <strong className="font-medium text-ink-900">
                {fmtDate(nextFree)}
              </strong>
            </span>
          )}
          {allFree && (
            <span className="text-ink-500">
              all free by{" "}
              <strong className="font-medium text-ink-900">
                {fmtDate(allFree)}
              </strong>
            </span>
          )}
        </div>

        {resources.length === 0 ? (
          <p className="text-sm text-ink-400 italic">Nobody on the books.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {ordered.slice(0, 8).map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[150px_1fr_92px] gap-3 items-center py-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900 truncate">
                    {r.name}
                  </span>
                  <span className="block text-[11px] text-ink-500 truncate">
                    {r.openTags > 0 ? `${r.openTags} tags open` : "nothing open"}
                  </span>
                </span>

                {/* The same picture as the full page, in miniature. */}
                <span className="relative block h-4">
                  <span className="absolute inset-x-0 top-1.5 h-1.5 rounded-pill bg-ink-100" />
                  {r.projects.map((bk, i) => {
                    const left = Math.max(0, axisPct(bk.startDate));
                    const right = Math.min(100, axisPct(bk.endDate));
                    return (
                      <span
                        key={`${r.id}-${i}`}
                        className="absolute top-1 h-2.5 rounded-pill bg-brand-blue"
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(1.5, right - left)}%`,
                        }}
                        title={`${bk.projectName} · ${fmtDate(bk.startDate)} to ${fmtDate(bk.endDate)}`}
                      />
                    );
                  })}
                  <span
                    className="absolute top-0 bottom-0 w-px bg-ink-400"
                    style={{ left: `${todayPct}%` }}
                  />
                </span>

                <span className="text-right whitespace-nowrap">
                  {r.status === "Free" ? (
                    <span className="inline-block px-2 py-0.5 rounded-pill text-[11px] font-semibold bg-brand-greenBg text-brand-greenText">
                      Free
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-ink-900 tabular-nums">
                      {r.availableFrom ? fmtDate(r.availableFrom) : "—"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {ordered.length > 8 && (
          <p className="text-xs text-ink-400 mt-2">
            +{ordered.length - 8} more on the full page.
          </p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Dot({ className }: { className: string }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-1 ${className}`} />
  );
}

/**
 * Delivered / pending / remaining in one bar.
 *
 * Three segments rather than a single percentage because "80% done"
 * quietly conflates finished work with work that is merely claimed, and
 * only the first counts as delivered.
 */
function SegmentedBar({
  total,
  delivered,
  pending,
  height = "h-2",
}: {
  total: number;
  delivered: number;
  pending: number;
  height?: string;
}) {
  const pct = total > 0 ? (delivered / total) * 100 : 0;
  const pendingPct =
    total > 0 ? Math.min(100 - pct, (pending / total) * 100) : 0;
  return (
    <div className={`${height} rounded-pill bg-ink-100 overflow-hidden flex`}>
      <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
      <div
        className="h-full bg-brand-yellow"
        style={{ width: `${pendingPct}%` }}
      />
    </div>
  );
}

function SlackPill({ slack }: { slack: number | null }) {
  if (slack === null) {
    return <span className="text-[11px] text-ink-400">no handover set</span>;
  }
  const late = slack < 0;
  return (
    <span
      className={`inline-block mt-0.5 px-2 py-0.5 rounded-pill text-[11px] font-semibold ${
        late
          ? "bg-brand-redBg text-brand-redText"
          : "bg-brand-greenBg text-brand-greenText"
      }`}
    >
      {late ? `${Math.abs(slack)}d late` : `${slack}d spare`}
    </span>
  );
}

function Headline({
  label,
  value,
  tone = "plain",
  href,
}: {
  label: string;
  value: number;
  tone?: "plain" | "ok" | "warn" | "late";
  href?: string;
}) {
  const colour =
    tone === "late"
      ? "text-brand-redText"
      : tone === "warn"
        ? "text-brand-yellowText"
        : tone === "ok"
          ? "text-brand-greenText"
          : "text-ink-900";
  const inner = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className={`font-heading text-3xl font-semibold mt-0.5 ${colour}`}>
        {value}
      </div>
    </>
  );
  // Every figure is a way in to the screen that explains it — a number a
  // CEO cannot drill into is a number they have to email somebody about.
  return href ? (
    <Link href={href} className="card p-4 hover:bg-ink-50 transition">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}

function SectionHead({
  icon,
  title,
  note,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  note?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
      <div>
        <h2 className="font-heading text-base font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {note && <p className="text-xs text-ink-500 mt-0.5">{note}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="text-xs font-medium text-brand-blue hover:underline inline-flex items-center gap-1 shrink-0"
        >
          {linkLabel ?? "Open"} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

