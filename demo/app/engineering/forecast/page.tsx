"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import {
  ResourceChecklist,
  useAvailability,
} from "@/components/DomainResourcePicker";
import {
  DomainForecastCard,
  statusTone,
  type Forecast,
  type ProjectRow,
} from "@/components/DomainForecastCard";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainRefreshButton } from "@/components/DomainRefreshButton";
import { fmtDate as fmt } from "@/lib/domain-format";
import { dateClass } from "@/lib/domain-ui";
import {
  DomainHandoverFields,
  emptyHandover,
  handoverPayload,
  type HandoverValue,
} from "@/components/DomainHandoverFields";
import { TAG_HOLDER_ROLES, type DomainRole } from "@/lib/domain";

type Meta = { rateHistoryDays: number };

type SortKey = "risk" | "handover" | "name";

export default function ForecastPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "risk" | "ontrack">("all");
  const [sort, setSort] = useState<SortKey>("risk");
  /**
   * Use a rate set on a booking exactly as set, rather than dividing it
   * between the projects that person is on at the same time.
   *
   * Off by default: changing how every figure on the page is computed
   * should be something you turn on deliberately, not something you
   * inherit without noticing.
   */
  const [perProjectRates, setPerProjectRates] = useState(false);

  // Returns the promise so the Refresh button can show it in flight.
  const load = useCallback(() => {
    const q = perProjectRates ? "?perProjectRates=1" : "";
    return fetch(`/api/domain/forecast${q}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("Forecast is for Leads and Admins.");
        if (!r.ok) throw new Error("Couldn't load the forecast.");
        return r.json();
      })
      .then((b) => {
        setProjects(b.projects ?? []);
        setMeta(b.meta ?? null);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
    // Re-reads when the option changes: the whole page is computed from
    // this answer, so it cannot be filtered client-side.
  }, [perProjectRates]);

  useEffect(() => {
    void load();
  }, [load]);

  const behind = projects.filter((p) => p.forecast.status === "Behind Schedule");
  const onTrack = projects.filter((p) => p.forecast.status === "On Track");
  const totalTags = projects.reduce((s, p) => s + p.totalTags, 0);
  const delivered = projects.reduce((s, p) => s + p.deliveredTags, 0);
  const pending = projects.reduce((s, p) => s + p.pendingApprovalTags, 0);
  const throughput =
    Math.round(projects.reduce((s, p) => s + p.forecast.dailyRate, 0) * 100) / 100;
  const people = new Set<string>();
  projects.forEach((p) => p.resources.forEach((r) => people.add(r.id)));
  const pct = totalTags > 0 ? (delivered / totalTags) * 100 : 0;

  const shown = projects
    .filter((p) => {
      if (filter === "risk") return p.forecast.status === "Behind Schedule";
      if (filter === "ontrack") return p.forecast.status === "On Track";
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "handover") {
        return (a.handoverDate ?? "9999").localeCompare(b.handoverDate ?? "9999");
      }
      // Risk: worst slack first, so a review opens on the problem.
      const slack = (x: ProjectRow) =>
        x.forecast.slackDays ?? Number.POSITIVE_INFINITY;
      return slack(a) - slack(b);
    });

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Delivery forecast"
        description={`Every estimate here is computed from tag counts a Lead has approved${
          meta ? ` in the last ${meta.rateHistoryDays} days` : ""
        } — not from manual status updates.${
          perProjectRates
            ? " Rates set on a booking are being used as set, undivided."
            : " A shared person's rate is divided between their concurrent projects."
        }`}
        actions={<DomainRefreshButton onRefresh={load} />}
      />

      {error && (
        <div className="card p-4 mb-6 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {/* ---- portfolio status ---------------------------------------
          Two questions, answered in that order: how is the whole book
          doing, and which projects are in trouble.

          The projects in trouble used to be a comma-separated list inside
          a sentence, sitting under four large figures about tag counts.
          That put the least actionable information in the largest type
          and the most actionable in the smallest. Now the two groups are
          side by side, each project named with the number that decides
          it, and each panel filters the list below.                     */}
      {projects.length > 0 && (
        <section className="card p-5 mb-6">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="font-heading text-lg font-semibold">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </h2>
            <span className="text-sm text-ink-500">
              <strong className="text-brand-greenText">{delivered}</strong> of{" "}
              <strong className="text-ink-900">{totalTags}</strong> tags
              delivered
              {pending > 0 && (
                <span className="text-brand-yellowText">
                  {" · "}
                  {pending} awaiting sign-off
                </span>
              )}
              {" · "}
              {throughput}/day across {people.size}{" "}
              {people.size === 1 ? "person" : "people"}
            </span>
          </div>

          <div className="h-2.5 rounded-pill bg-ink-100 overflow-hidden mt-3 flex">
            <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
            <div
              className="h-full bg-brand-yellow"
              style={{
                width: `${totalTags > 0 ? Math.min(100 - pct, (pending / totalTags) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-ink-500 mt-1.5">
            <strong className="text-ink-900">{Math.round(pct)}%</strong> of the
            portfolio delivered
          </p>

          <div className="grid md:grid-cols-2 gap-4 mt-5">
            <StatusGroup
              title="At risk"
              tone="risk"
              projects={behind}
              empty="Nothing at risk."
              onOpen={() => setFilter("risk")}
            />
            <StatusGroup
              title="On track"
              tone="ontrack"
              projects={onTrack}
              empty="Nothing on track yet."
              onOpen={() => setFilter("ontrack")}
            />
          </div>
        </section>
      )}

      <Simulator onDone={load} />

      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-heading text-xl font-semibold">Project delivery</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <RateModeToggle on={perProjectRates} onChange={setPerProjectRates} />
            <div className="flex items-center gap-1">
              {(
                [
                  ["all", `All ${projects.length}`],
                  ["risk", `At risk ${behind.length}`],
                  ["ontrack", `On track ${onTrack.length}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
                    filter === key
                      ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                      : "bg-white text-ink-600 border-ink-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="text-xs text-ink-500 flex items-center gap-1.5">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="px-2 py-1 rounded border border-ink-200 text-xs"
              >
                <option value="risk">Most at risk</option>
                <option value="handover">Handover date</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="text-sm text-ink-400 italic">
            {projects.length === 0
              ? "No projects yet."
              : "No projects match that filter."}
          </p>
        ) : (
          // Two up from lg. Each card is now short enough that a pair fits
          // side by side, which is what makes a portfolio comparable
          // rather than a list you scroll through.
          <div className="grid gap-4 lg:grid-cols-2">
            {shown.map((p) => (
              <DomainForecastCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-ink-400">
        Looking for who&apos;s free? Resource availability moved to its own page
        — see{" "}
        <a href="/engineering/availability" className="text-brand-blue">
          Resource availability
        </a>
        .
      </p>
    </DomainPage>
  );
}

/**
 * One side of the portfolio split.
 *
 * Names the projects rather than counting them: "2 behind schedule" tells
 * a Lead there is a problem, "uuuu, 1183 days late" tells them which
 * conversation to have. The heading is a button because the obvious next
 * move after reading this is to see only these projects.
 */
function StatusGroup({
  title,
  tone,
  projects,
  empty,
  onOpen,
}: {
  title: string;
  tone: "risk" | "ontrack";
  projects: ProjectRow[];
  empty: string;
  onOpen: () => void;
}) {
  const risk = tone === "risk";
  // Worst first on the risk side, most slack first on the other: both
  // put the project you would ask about at the top of its own column.
  const ordered = [...projects].sort((a, b) => {
    const sa = a.forecast.slackDays ?? 0;
    const sb = b.forecast.slackDays ?? 0;
    return risk ? sa - sb : sb - sa;
  });

  return (
    <div
      className={`rounded border-l-4 bg-ink-50 px-4 py-3 ${
        risk ? "border-brand-red" : "border-brand-green"
      }`}
    >
      <button
        onClick={onOpen}
        disabled={projects.length === 0}
        className="flex items-baseline gap-2 mb-2 group disabled:cursor-default"
      >
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            risk ? "text-brand-redText" : "text-brand-greenText"
          }`}
        >
          {title}
        </span>
        <span className="font-heading text-xl font-semibold text-ink-900">
          {projects.length}
        </span>
        {projects.length > 0 && (
          <span className="text-[11px] text-brand-blue opacity-0 group-hover:opacity-100 transition">
            show these
          </span>
        )}
      </button>

      {ordered.length === 0 ? (
        <p className="text-xs text-ink-400 italic">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {ordered.map((p) => {
            const slack = p.forecast.slackDays;
            return (
              <li
                key={p.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="text-ink-900 truncate">{p.name}</span>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    risk ? "text-brand-redText" : "text-brand-greenText"
                  }`}
                >
                  {slack === null
                    ? "no handover date"
                    : slack < 0
                      ? `${Math.abs(slack)} days late`
                      : `${slack} days spare`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * "Use per-project rates as set."
 *
 * Says what it changes rather than naming the setting, because the two
 * readings of a shared person's rate are genuinely different answers and
 * the reader has to know which one is on screen.
 */
function RateModeToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-center gap-2 text-xs cursor-pointer select-none"
      title={
        on
          ? "A rate set on a booking is used as set. People without one still share their overall rate between concurrent projects."
          : "Every rate is divided between the projects that person is booked on at the same time."
      }
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-ink-300 text-brand-blue focus:ring-brand-blue"
      />
      <span className={on ? "text-brand-blue font-medium" : "text-ink-600"}>
        Use per-project rates as set
      </span>
    </label>
  );
}

type SimResult = {
  forecast: Forecast;
  resources: {
    id: string;
    name: string;
    rate: number;
    fullRate: number;
    concurrentProjects: number;
  }[];
  conflicts: {
    resourceName: string;
    conflicts: { projectName: string; startDate: string; endDate: string; availableFrom: string }[];
  }[];
};

/** What-if: tags + people + a handover date, answered with a delivery date.
 *  Writes nothing, so a Lead can try plans freely before committing. */
function Simulator({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [totalTags, setTotalTags] = useState("");
  const [schedule, setSchedule] = useState<HandoverValue>(emptyHandover());
  /** Per-person tags/day to plan at. Required — the simulation uses these
   *  and nothing else. */
  const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({});
  /** Use the rates typed below as-is, rather than dividing each by the
   *  projects that person is already booked on over the same window. */
  const [simPerProjectRates, setSimPerProjectRates] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { byId: availability } = useAvailability(open);
  /** Every picked person needs a rate before this can run — the API
   *  refuses otherwise, so the button says so first. */
  const allRated = picked.every((id) => Number(rateOverrides[id]) > 0);

  useEffect(() => {
    if (!open || people.length > 0) return;
    fetch("/api/domain/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) =>
        setPeople(
          (b.users ?? []).filter((u: { role: string; isActive?: boolean }) =>
            TAG_HOLDER_ROLES.includes(u.role as DomainRole) && u.isActive !== false,
          ),
        ),
      )
      .catch(() => setPeople([]));
  }, [open, people.length]);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/domain/forecast/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usePerProjectRates: simPerProjectRates,
        totalTags: Number(totalTags),
        resourceIds: picked,
        ...handoverPayload(schedule),
        rateOverrides: Object.fromEntries(
          Object.entries(rateOverrides)
            .filter(([id, v]) => picked.includes(id) && Number(v) > 0)
            .map(([id, v]) => [id, Number(v)]),
        ),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Simulation failed.");
      setResult(null);
      return;
    }
    setResult(body.simulation);
    onDone();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary mb-6">
        Simulate a project
      </button>
    );
  }

  return (
    <section className="card p-4 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-semibold">Simulate a project</h2>
        <button onClick={() => setOpen(false)} className="btn-ghost text-sm">
          Close
        </button>
      </div>
      <p className="text-sm text-ink-500 mb-4">
        Try a plan before committing to it. Nothing is saved — this only reads
        each person&apos;s approved delivery rate.
      </p>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Number of tags</span>
          <input
            type="number"
            min={1}
            value={totalTags}
            onChange={(e) => setTotalTags(e.target.value)}
            placeholder="500"
            className="w-full border border-ink-200 rounded px-2 py-1.5"
          />
        </label>
      </div>

      {/* Same fields and the same server calculation as creating a
          project, so a plan that simulates well keeps its date once it
          becomes real. */}
      <div className="mb-4">
        <DomainHandoverFields value={schedule} onChange={setSchedule} />
      </div>

      <div className="text-sm mt-3">
        <span className="block text-ink-700 mb-1">
          Resources — tick who&apos;s on it, then set the tags/day to plan each
          of them at
        </span>
        <ResourceChecklist
          people={people}
          picked={picked}
          availability={availability}
          showRate={false}
          onToggle={(id, next) =>
            setPicked((prev) => (next ? [...prev, id] : prev.filter((x) => x !== id)))
          }
          emptyLabel="No resources available."
        />
        {/*
          Rates are typed, never pre-filled from what someone has averaged
          before. A simulation is an assumption you are making on purpose;
          seeding it with history quietly turns "what if we plan at 40"
          into "what happened last month".
        */}
        {picked.length > 0 && (
          <div className="mt-2 border border-ink-200 rounded divide-y divide-ink-100">
            {picked.map((id) => {
              const person = people.find((p) => p.id === id);
              if (!person) return null;
              return (
                <div key={id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="text-sm text-ink-700 flex-1 truncate">
                    {person.name}
                  </span>
                  <input
                    type="number"
                    min={1}
                    step="0.5"
                    value={rateOverrides[id] ?? ""}
                    onChange={(e) =>
                      setRateOverrides((prev) => ({ ...prev, [id]: e.target.value }))
                    }
                    placeholder="tags/day"
                    aria-label={`Tags per day for ${person.name}`}
                    className={`w-28 border rounded px-2 py-1 text-sm ${
                      Number(rateOverrides[id]) > 0
                        ? "border-ink-200"
                        : "border-brand-yellowBorder bg-brand-yellowBg"
                    }`}
                  />
                  <span className="text-xs text-ink-400 w-14">tags/day</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sits with the rates it governs rather than in a settings panel
          elsewhere: it changes what the numbers typed above mean. */}
      <label className="flex items-center gap-2 text-xs cursor-pointer select-none mt-4">
        <input
          type="checkbox"
          checked={simPerProjectRates}
          onChange={(e) => setSimPerProjectRates(e.target.checked)}
          className="rounded border-ink-300 text-brand-blue focus:ring-brand-blue"
        />
        <span
          className={
            simPerProjectRates ? "text-brand-blue font-medium" : "text-ink-600"
          }
        >
          Use the rates above as set
        </span>
        <span className="text-ink-400">
          {simPerProjectRates
            ? "— as typed, even for people already on other projects"
            : "— each divided by the projects that person is already on"}
        </span>
      </label>

      <button
        onClick={run}
        disabled={busy || picked.length === 0 || !allRated}
        className="btn-primary mt-3 disabled:opacity-50"
        title={
          picked.length > 0 && !allRated
            ? "Set a tags/day rate for everyone you've picked"
            : undefined
        }
      >
        {busy ? "Calculating…" : "Run simulation"}
      </button>

      {error && <p className="text-sm text-brand-redText mt-3">{error}</p>}

      {result && (
        <div className="mt-4 pt-4 border-t border-ink-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusTone(result.forecast.status).chip}`}
            >
              {result.forecast.status}
            </span>
            <span className="text-sm text-ink-900 font-medium">
              Estimated delivery {fmt(result.forecast.projectedDate)}
            </span>
          </div>
          <p className="text-sm text-ink-500 mt-1">{result.forecast.reason}</p>
          <p className="text-xs text-ink-500 mt-1">
            {result.resources
              .map(
                (r) =>
                  `${r.name} ${r.rate}/day${
                    // Every rate here was typed in, so the only thing worth
                    // saying is when it had to be shared across projects.
                    r.rate !== r.fullRate ? ` (you set ${r.fullRate})` : ""
                  }${
                    r.concurrentProjects > 1
                      ? ` — shared across ${r.concurrentProjects} projects`
                      : ""
                  }`,
              )
              .join(" · ")}
          </p>

          {result.conflicts.length > 0 && (
            <div className="mt-3 p-3 rounded bg-brand-yellowBg border border-brand-yellowBorder">
              <div className="flex items-center gap-1.5 text-sm font-medium text-brand-yellowText">
                <AlertTriangle size={14} /> Already allocated over this window
              </div>
              <ul className="mt-1 space-y-0.5">
                {result.conflicts.map((c) => (
                  <li key={c.resourceName} className="text-xs text-ink-700">
                    <span className="font-medium">{c.resourceName}</span> —{" "}
                    {c.conflicts
                      .map(
                        (x) =>
                          `${x.projectName} (${fmt(x.startDate)} → ${fmt(x.endDate)}, free ${fmt(x.availableFrom)})`,
                      )
                      .join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
