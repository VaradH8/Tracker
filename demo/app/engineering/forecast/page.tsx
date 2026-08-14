"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, RefreshCw } from "lucide-react";
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
import { fmtDate as fmt } from "@/lib/domain-format";
import { dateClass } from "@/lib/domain-ui";
import { TAG_HOLDER_ROLES, type DomainRole } from "@/lib/domain";

type Meta = { defaultTagsPerDay: number; rateHistoryDays: number };

type SortKey = "risk" | "handover" | "name";

export default function ForecastPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "risk" | "ontrack">("all");
  const [sort, setSort] = useState<SortKey>("risk");

  const load = useCallback(() => {
    fetch("/api/domain/forecast", { cache: "no-store" })
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
  }, []);

  useEffect(load, [load]);

  const behind = projects.filter((p) => p.forecast.status === "Behind Schedule");
  const onTrack = projects.filter((p) => p.forecast.status === "On Track");
  const totalTags = projects.reduce((s, p) => s + p.totalTags, 0);
  const delivered = projects.reduce((s, p) => s + p.deliveredTags, 0);
  const pending = projects.reduce((s, p) => s + p.pendingApprovalTags, 0);
  const remaining = projects.reduce((s, p) => s + p.remainingTags, 0);
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
        } — not from manual status updates. Approve a submission and these dates move with it.`}
        actions={
          <button
            onClick={load}
            className="btn-ghost inline-flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error && (
        <div className="card p-4 mb-6 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {/* ---- portfolio headline: the answer before the detail ------- */}
      {projects.length > 0 && (
        <section className="card p-6 mb-6">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="text-xs text-ink-500 font-medium uppercase tracking-wide">
                Portfolio status
              </div>
              <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                <span className="font-heading text-3xl font-semibold text-ink-900">
                  {projects.length} project{projects.length === 1 ? "" : "s"}
                </span>
                {behind.length > 0 ? (
                  <span className="px-3 py-1 rounded-pill text-sm font-semibold bg-brand-redBg text-brand-redText">
                    {behind.length} behind schedule
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-pill text-sm font-semibold bg-brand-greenBg text-brand-greenText">
                    All on track
                  </span>
                )}
                {onTrack.length > 0 && behind.length > 0 && (
                  <span className="text-sm text-ink-500">
                    {onTrack.length} on track
                  </span>
                )}
              </div>
              {behind.length > 0 && (
                <p className="text-sm text-ink-600 mt-2">
                  At risk:{" "}
                  <strong className="text-brand-redText">
                    {behind.map((p) => p.name).join(", ")}
                  </strong>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <SummaryFigure label="Tags total" value={totalTags} />
              <SummaryFigure
                label="Delivered"
                value={delivered}
                tone="text-brand-greenText"
              />
              <SummaryFigure label="Remaining" value={remaining} />
              <SummaryFigure
                label="Throughput"
                value={`${throughput}/day`}
                sub={`${people.size} people`}
              />
            </div>
          </div>

          <div className="h-2.5 rounded-pill bg-ink-100 overflow-hidden mt-5 flex">
            <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
            <div
              className="h-full bg-brand-yellow"
              style={{
                width: `${totalTags > 0 ? Math.min(100 - pct, (pending / totalTags) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-ink-500 mt-2">
            <strong className="text-ink-900">{Math.round(pct)}%</strong> of the
            portfolio delivered
            {pending > 0 && (
              <span className="text-brand-yellowText">
                {" "}
                · {pending} tags awaiting approval
              </span>
            )}
          </p>
        </section>
      )}

      <Simulator onDone={load} />

      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-heading text-xl font-semibold">Project delivery</h2>
          <div className="flex items-center gap-3 flex-wrap">
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
          <div className="grid gap-5">
            {shown.map((p) => (
              <DomainForecastCard
                key={p.id}
                p={p}
               
              />
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

function SummaryFigure({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-ink-500 font-medium uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`font-heading text-2xl font-semibold mt-0.5 ${tone ?? "text-ink-900"}`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>}
    </div>
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
    measuredRate: number | null;
    overridden: boolean;
    usingDefaultRate: boolean;
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
  const [startDate, setStartDate] = useState("");
  const [handoverDate, setHandoverDate] = useState("");
  /** Per-person tags/day the Lead wants to assume, keyed by user id.
   *  Blank means "use their measured rate". */
  const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { byId: availability } = useAvailability(open);

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
        totalTags: Number(totalTags),
        resourceIds: picked,
        startDate: startDate || null,
        handoverDate: handoverDate || null,
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
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={dateClass("sm", "w-full")}
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Handover date</span>
          <input
            type="date"
            value={handoverDate}
            onChange={(e) => setHandoverDate(e.target.value)}
            className={dateClass("sm", "w-full")}
          />
        </label>
      </div>

      <div className="text-sm mt-3">
        <span className="block text-ink-700 mb-1">
          Resources — tick who&apos;s on it, and override their tags/day if you
          want to test a different pace
        </span>
        <ResourceChecklist
          people={people}
          picked={picked}
          availability={availability}
          onToggle={(id, next) =>
            setPicked((prev) => (next ? [...prev, id] : prev.filter((x) => x !== id)))
          }
          emptyLabel="No resources available."
        />
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
                    value={rateOverrides[id] ?? ""}
                    onChange={(e) =>
                      setRateOverrides((prev) => ({ ...prev, [id]: e.target.value }))
                    }
                    placeholder={
                      availability.get(id)
                        ? String(availability.get(id)!.rate)
                        : "tags/day"
                    }
                    title="Leave blank to use their measured rate"
                    className="w-28 border border-ink-200 rounded px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-ink-400 w-14">tags/day</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button onClick={run} disabled={busy} className="btn-primary mt-3">
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
                    r.overridden
                      ? ` (you set ${r.fullRate}${r.measuredRate ? `, measured ${r.measuredRate}` : ""})`
                      : r.usingDefaultRate
                        ? " (no rate set)"
                        : ""
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
