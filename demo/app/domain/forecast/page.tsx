"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, RefreshCw } from "lucide-react";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";

type ResourceRow = {
  id: string;
  name: string;
  role: DomainRole;
  rate: number | null;
  effectiveRate: number;
  usingDefaultRate: boolean;
  availableFrom: string | null;
  status: "Free" | "Allocated";
  projects: {
    projectId: number;
    projectName: string;
    startDate: string;
    endDate: string;
    releasedAt: string | null;
    assignedTags: number;
    deliveredTags: number;
  }[];
};

type Forecast = {
  dailyRate: number;
  workingDaysNeeded: number;
  projectedDate: string | null;
  status: "On Track" | "Behind Schedule" | "Unknown";
  slackDays: number | null;
  reason: string;
};

type ProjectRow = {
  id: number;
  name: string;
  owner: string;
  handoverDate: string | null;
  totalTags: number;
  assignedTags: number;
  deliveredTags: number;
  remainingTags: number;
  pendingApprovalTags: number;
  divisions: { id: number; name: string; totalTags: number; assignedTags: number; deliveredTags: number }[];
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

type Meta = { defaultTagsPerDay: number; rateHistoryDays: number };

function statusCls(s: string): string {
  if (s === "On Track") return "bg-brand-greenBg text-brand-greenText";
  if (s === "Behind Schedule") return "bg-brand-redBg text-brand-redText";
  return "bg-ink-100 text-ink-500";
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Delivered / assigned as a bar, with the pending slice called out. */
function TagBar({
  delivered,
  total,
  pending = 0,
}: {
  delivered: number;
  total: number;
  pending?: number;
}) {
  const pct = total > 0 ? Math.min(100, (delivered / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.min(100 - pct, (pending / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden flex">
        <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
        <div className="h-full bg-brand-yellow" style={{ width: `${pendingPct}%` }} />
      </div>
      <div className="text-xs text-ink-500 mt-1">
        {delivered} / {total} delivered
        {pending > 0 && (
          <span className="text-brand-yellowText"> · {pending} awaiting approval</span>
        )}
      </div>
    </div>
  );
}

export default function ForecastPage() {
  const [resources, setResources] = useState<ResourceRow[] | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/domain/forecast", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("Forecast is for Leads and Admins.");
        if (!r.ok) throw new Error("Couldn't load the forecast.");
        return r.json();
      })
      .then((b) => {
        setResources(b.resources ?? []);
        setProjects(b.projects ?? []);
        setMeta(b.meta ?? null);
        setError(null);
      })
      .catch((e: Error) => {
        setResources([]);
        setError(e.message);
      });
  }, []);

  useEffect(load, [load]);

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Forecast</h1>
          <p className="text-sm text-ink-500 mt-1">
            Where each project lands against its handover date, and who frees up
            when. Delivery rates come from tag counts a Lead has approved
            {meta ? ` in the last ${meta.rateHistoryDays} days` : ""} — approve a
            submission and these numbers move with it.
          </p>
        </div>
        <button onClick={load} className="btn-ghost inline-flex items-center gap-1.5 shrink-0">
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      {error && (
        <div className="card p-4 mb-6 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      <Simulator onDone={load} />

      <section className="mb-8">
        <h2 className="font-heading text-lg font-semibold mb-3">Project delivery</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-ink-400 italic">No projects yet.</p>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => (
              <article key={p.id} className="card p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="font-heading font-semibold text-ink-900">{p.name}</h3>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Owner {p.owner} · Handover {fmt(p.handoverDate)}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(p.forecast.status)}`}
                  >
                    {p.forecast.status}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <TagBar
                      delivered={p.deliveredTags}
                      total={p.totalTags}
                      pending={p.pendingApprovalTags}
                    />
                    {p.divisions.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {p.divisions.map((d) => (
                          <li key={d.id} className="text-xs text-ink-500">
                            <span className="text-ink-700">{d.name}</span>:{" "}
                            {d.deliveredTags} / {d.totalTags || d.assignedTags} delivered
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="text-sm">
                    <div className="flex items-center gap-1.5 text-ink-900 font-medium">
                      <CalendarClock size={14} className="text-ink-400" />
                      Projected {fmt(p.forecast.projectedDate)}
                    </div>
                    <p className="text-xs text-ink-500 mt-1">{p.forecast.reason}</p>
                    {p.startsFrom > new Date().toISOString().slice(0, 10) && (
                      <p className="text-xs text-ink-500 mt-1">
                        Counted from {fmt(p.startsFrom)}, when the first resource
                        starts.
                      </p>
                    )}
                    <p className="text-xs text-ink-500 mt-1">
                      {p.remainingTags} tags left at {p.forecast.dailyRate}/day across{" "}
                      {p.resources.length} resource(s)
                      {p.resources.some((r) => r.usingDefaultRate) && meta && (
                        <span className="text-brand-yellowText">
                          {" "}
                          · some on the default {meta.defaultTagsPerDay}/day (no approved
                          history yet)
                        </span>
                      )}
                    </p>
                    {p.resources.some((r) => r.concurrentProjects > 1) && (
                      <p className="text-xs text-brand-yellowText mt-1">
                        Shared time:{" "}
                        {p.resources
                          .filter((r) => r.concurrentProjects > 1)
                          .map(
                            (r) =>
                              `${r.name} ${r.rate}/day of ${r.fullRate} (across ${r.concurrentProjects} projects)`,
                          )
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading text-lg font-semibold mb-3">Resource availability</h2>
        {resources === null ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : resources.length === 0 ? (
          <p className="text-sm text-ink-400 italic">No resources yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Person</th>
                  <th className="text-left font-semibold px-4 py-2">Allocated to</th>
                  <th className="text-left font-semibold px-4 py-2">Rate</th>
                  <th className="text-left font-semibold px-4 py-2">Available from</th>
                  <th className="text-left font-semibold px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {resources.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium text-ink-900">{r.name}</div>
                      <div className="text-xs text-ink-500">
                        {DOMAIN_ROLE_LABELS[r.role]}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      {r.projects.length === 0 ? (
                        <span className="text-xs text-ink-400 italic">Nothing booked</span>
                      ) : (
                        <ul className="space-y-1">
                          {r.projects.map((p) => (
                            <li key={p.projectId} className="text-xs">
                              <span className="text-ink-900 font-medium">
                                {p.projectName}
                              </span>
                              <span className="text-ink-500">
                                {" "}
                                · {fmt(p.startDate)} → {fmt(p.releasedAt ?? p.endDate)}
                                {p.releasedAt && " (released early)"}
                              </span>
                              {p.assignedTags > 0 && (
                                <span className="text-ink-500">
                                  {" "}
                                  · {p.deliveredTags}/{p.assignedTags} tags
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-ink-700">
                      {r.effectiveRate}/day
                      {r.usingDefaultRate && (
                        <div className="text-xs text-ink-400">default</div>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-ink-700">
                      {r.availableFrom ? fmt(r.availableFrom) : "Now"}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <span
                        className={`px-2 py-0.5 rounded-pill text-xs font-medium ${
                          r.status === "Free"
                            ? "bg-brand-greenBg text-brand-greenText"
                            : "bg-brand-blueBg text-brand-blue"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
  const [handoverDate, setHandoverDate] = useState("");
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || people.length > 0) return;
    fetch("/api/domain/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) =>
        setPeople(
          (b.users ?? []).filter((u: { role: string; isActive?: boolean }) =>
            ["Actionee", "SME", "TeamLead"].includes(u.role) && u.isActive !== false,
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
        handoverDate: handoverDate || null,
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
          <span className="block text-ink-700 mb-1">Handover date</span>
          <input
            type="date"
            value={handoverDate}
            onChange={(e) => setHandoverDate(e.target.value)}
            className="w-full border border-ink-200 rounded px-2 py-1.5"
          />
        </label>
        <div className="text-sm">
          <span className="block text-ink-700 mb-1">Resources</span>
          <div className="border border-ink-200 rounded max-h-28 overflow-y-auto p-1">
            {people.length === 0 ? (
              <p className="text-xs text-ink-400 p-1">No resources available.</p>
            ) : (
              people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(p.id)}
                    onChange={(e) =>
                      setPicked((prev) =>
                        e.target.checked
                          ? [...prev, p.id]
                          : prev.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      <button onClick={run} disabled={busy} className="btn-primary mt-3">
        {busy ? "Calculating…" : "Run simulation"}
      </button>

      {error && <p className="text-sm text-brand-redText mt-3">{error}</p>}

      {result && (
        <div className="mt-4 pt-4 border-t border-ink-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(result.forecast.status)}`}
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
                  `${r.name} ${r.rate}/day${r.usingDefaultRate ? " (default)" : ""}${
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
