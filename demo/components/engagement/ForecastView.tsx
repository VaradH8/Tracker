"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Trash2, Users2 } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { ROLE_LABELS } from "@/lib/role";
import {
  FORECAST_ROLES,
  fmtDay,
  freeFrom,
  maxISO,
  nextWorkingDay,
  summariseForecast,
  TRACKS,
  type EngagementBlock,
  type ForecastBlock,
  type ForecastMember,
  type LeaveBlock,
  type Track,
} from "@/lib/engagement";
import { EngagementGrid, GridLegend } from "./EngagementGrid";
import {
  byUser,
  fmtHours,
  inputCls,
  labelCls,
  PeriodControls,
  StatTile,
  TRACK_PILL,
  useGridView,
  usePeriods,
  useWorkDays,
  type EngagementData,
  type EngagementPerson,
  type PlanningProject,
  type SavedForecast,
} from "./shared";

type Setup = {
  projectId: number | null;
  track: Track;
  startDate: string;
  targetDate: string;
  effort: string;
};

const keyOf = (projectId: number, track: Track) => `${projectId}/${track}`;

/** Effort to plan for when nothing is saved yet: the unspent budget, or
 *  the open tasks' estimates when the project has no budget. */
function defaultEffort(p: PlanningProject): number {
  if (p.budgetHours > 0) return Math.max(0, p.budgetHours - p.loggedHours);
  return p.openEstimateHours;
}

function setupFor(
  p: PlanningProject | undefined,
  track: Track,
  saved: SavedForecast | undefined,
  today: string,
): Setup {
  if (!p) return { projectId: null, track, startDate: today, targetDate: "", effort: "0" };
  if (saved) {
    return {
      projectId: p.id,
      track,
      startDate: saved.startDate,
      targetDate: saved.targetDate ?? "",
      effort: String(saved.effortHours),
    };
  }
  const start = maxISO(p.startDate, today);
  return {
    projectId: p.id,
    track,
    startDate: start,
    targetDate: p.targetDate >= start ? p.targetDate : "",
    effort: String(defaultEffort(p)),
  };
}

export function ForecastView({
  data,
  reload,
}: {
  data: EngagementData;
  reload: () => Promise<void>;
}) {
  const toast = useToast();
  const workDays = useWorkDays(data);
  const today = data.today;
  const work = useMemo(() => byUser(data.blocks), [data.blocks]);
  const leaves = useMemo(() => byUser(data.leaves), [data.leaves]);

  // Upcoming (Discovery) projects first — those are the ones that need
  // staffing — then the active ones.
  const upcoming = data.projects.filter((p) => p.status === "Discovery");
  const others = data.projects.filter((p) => p.status !== "Discovery");
  const savedFor = (projectId: number | null, track: Track) =>
    data.forecasts.find((f) => f.projectId === projectId && f.track === track);

  const [setup, setSetup] = useState<Setup>(() => {
    // Reopen the most recently saved forecast, else the first upcoming project.
    const last = data.forecasts[0];
    const lastProject = last && data.projects.find((p) => p.id === last.projectId);
    if (last && lastProject) return setupFor(lastProject, last.track, last, today);
    const p = upcoming[0] ?? others[0];
    return setupFor(p, "Application", p ? savedFor(p.id, "Application") : undefined, today);
  });
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(savedFor(setup.projectId, setup.track)?.memberIds ?? []),
  );
  const [busy, setBusy] = useState(false);

  const project = data.projects.find((p) => p.id === setup.projectId);
  const saved = savedFor(setup.projectId, setup.track);

  function select(projectId: number | null, track: Track) {
    const p = data.projects.find((x) => x.id === projectId);
    const s = p ? savedFor(p.id, track) : undefined;
    setSetup(setupFor(p, track, s, today));
    setChosen(new Set(s?.memberIds ?? []));
  }

  // Who's reserved by *other* forecasts — hidden from this one's picks.
  const reservedElsewhere = useMemo(() => {
    const out = new Map<string, SavedForecast>();
    for (const f of data.forecasts) {
      if (f.completed) continue;
      if (f.projectId === setup.projectId && f.track === setup.track) continue;
      for (const id of f.memberIds) out.set(id, f);
    }
    return out;
  }, [data.forecasts, setup.projectId, setup.track]);

  // Work starts on the first working day on/after the chosen start.
  const start = nextWorkingDay(setup.startDate || today, workDays);
  const target = setup.targetDate || null;
  const effort = Math.max(0, Number(setup.effort) || 0);

  const onTrack = data.people.filter(
    (p) => p.track === setup.track && (FORECAST_ROLES as readonly string[]).includes(p.role),
  );
  const candidates = onTrack
    .filter((p) => !reservedElsewhere.has(p.id))
    .map((p) => ({
      person: p,
      from: nextWorkingDay(maxISO(start, freeFrom(work[p.id], today, workDays)), workDays),
    }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.person.name.localeCompare(b.person.name));
  const reservedHere = onTrack.filter((p) => reservedElsewhere.has(p.id));
  const freeNowCount = candidates.filter((c) => c.from <= start).length;

  // Drop picks that are no longer candidates (reserved elsewhere / moved track).
  useEffect(() => {
    const ok = new Set(candidates.map((c) => c.person.id));
    if ([...chosen].some((id) => !ok.has(id))) {
      setChosen(new Set([...chosen].filter((id) => ok.has(id))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, setup.track, setup.projectId]);

  const members: ForecastMember[] = candidates
    .filter((c) => chosen.has(c.person.id))
    .map((c) => ({
      id: c.person.id,
      from: c.from,
      hoursPerDay: c.person.hoursPerDay,
      leaves: leaves[c.person.id],
    }));
  const summary = summariseForecast(effort, members, start, target, workDays, data.hoursPerDay || 8);

  const forecastBlocks: Record<string, ForecastBlock[]> = {};
  if (summary.endDate && project) {
    for (const m of members) {
      if (!summary.contributing.includes(m.id)) continue;
      forecastBlocks[m.id] = [
        { userId: m.id, projectId: project.id, projectName: project.name, start: m.from, end: summary.endDate },
      ];
    }
  }

  const dirty =
    !saved ||
    saved.startDate !== setup.startDate ||
    (saved.targetDate ?? "") !== setup.targetDate ||
    saved.effortHours !== effort ||
    saved.memberIds.length !== chosen.size ||
    saved.memberIds.some((id) => !chosen.has(id));

  const { view, setView } = useGridView(start);
  useEffect(() => {
    setView((v) => ({ ...v, anchor: start }));
  }, [start, setView]);
  const periods = usePeriods(view, workDays);

  async function build() {
    if (!project) return;
    setBusy(true);
    const r = await fetch("/api/engagement/forecasts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        track: setup.track,
        startDate: setup.startDate,
        targetDate: setup.targetDate || null,
        effortHours: effort,
        memberIds: [...chosen],
      }),
    });
    setBusy(false);
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      toast.show(b.error ?? "Couldn't save the forecast.", "error");
      return;
    }
    toast.show(`Forecast saved — ${chosen.size} ${chosen.size === 1 ? "person" : "people"} reserved.`, "success");
    await reload();
  }

  async function clear(projectId: number, track: Track, userId?: string) {
    setBusy(true);
    const qs = new URLSearchParams({ projectId: String(projectId), track });
    if (userId) qs.set("userId", userId);
    const r = await fetch(`/api/engagement/forecasts?${qs}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      toast.show("Couldn't update the forecast.", "error");
      return;
    }
    if (!userId && projectId === setup.projectId && track === setup.track) setChosen(new Set());
    toast.show(userId ? "Released." : "Forecast cleared.", "success");
    await reload();
  }

  if (data.projects.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-ink-500">
        No open projects to forecast. Create a project (status <strong>Discovery</strong> for upcoming work) first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ForecastList
        data={data}
        work={work}
        leaves={leaves}
        onOpen={select}
        onDelete={(f) => clear(f.projectId, f.track)}
        active={setup}
      />

      {/* Setup */}
      <div className="card p-3 flex flex-wrap items-end gap-3">
        <label className={labelCls}>
          Project
          <select
            className={`${inputCls} mt-1 block w-64`}
            value={setup.projectId ?? ""}
            onChange={(e) => select(Number(e.target.value), setup.track)}
          >
            {upcoming.length > 0 && (
              <optgroup label="Upcoming (Discovery)">
                {upcoming.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.client}</option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="In progress">
                {others.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.client}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label className={labelCls}>
          Track
          <select
            className={`${inputCls} mt-1 block w-40`}
            value={setup.track}
            onChange={(e) => select(setup.projectId, e.target.value as Track)}
          >
            {TRACKS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Effort (hours)
          <input
            type="number"
            min={0}
            step={1}
            className={`${inputCls} mt-1 block w-32`}
            value={setup.effort}
            onChange={(e) => setSetup({ ...setup, effort: e.target.value })}
          />
        </label>
        <label className={labelCls}>
          Start
          <input
            type="date"
            className={`${inputCls} mt-1 block w-40`}
            value={setup.startDate}
            onChange={(e) => setSetup({ ...setup, startDate: e.target.value })}
          />
        </label>
        <label className={labelCls}>
          Target
          <input
            type="date"
            min={setup.startDate}
            className={`${inputCls} mt-1 block w-40`}
            value={setup.targetDate}
            onChange={(e) => setSetup({ ...setup, targetDate: e.target.value })}
          />
        </label>
        {project && (
          <p className="text-xs text-ink-500 basis-full">
            {project.status} · budget {fmtHours(project.budgetHours)}, logged {fmtHours(project.loggedHours)}, open task estimates{" "}
            {fmtHours(project.openEstimateHours)} · project dates {fmtDay(project.startDate)} → {fmtDay(project.targetDate)}
          </p>
        )}
      </div>

      {/* Candidates */}
      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-700">
            <strong>{candidates.length}</strong> {setup.track} {candidates.length === 1 ? "person" : "people"} available
            {project ? <> for <strong>{project.name}</strong></> : null} · {freeNowCount} free on the start date · tick who to
            include, then build the forecast.
          </p>
          <div className="flex gap-1">
            <button type="button" className="btn-ghost !px-3 !py-1" onClick={() => setChosen(new Set(candidates.map((c) => c.person.id)))}>
              Select all
            </button>
            <button type="button" className="btn-ghost !px-3 !py-1" onClick={() => setChosen(new Set())}>
              Clear
            </button>
          </div>
        </div>

        {candidates.length === 0 ? (
          <p className="rounded border border-dashed border-ink-200 p-4 text-center text-sm text-ink-500">
            {reservedHere.length
              ? `Everyone on the ${setup.track} track is in another forecast — release someone below.`
              : `Nobody is on the ${setup.track} track yet — put developers on it in “Application & Plugin teams” below.`}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map(({ person, from }) => {
              const on = chosen.has(person.id);
              const later = from > start;
              return (
                <label
                  key={person.id}
                  className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 ${
                    on ? "border-violet-400 bg-violet-50" : "border-ink-200 bg-white hover:bg-ink-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-violet-600"
                    checked={on}
                    onChange={(e) => {
                      const next = new Set(chosen);
                      if (e.target.checked) next.add(person.id);
                      else next.delete(person.id);
                      setChosen(next);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-sm truncate">{person.name}</span>
                    <span className="block text-xs text-ink-500 truncate">
                      {person.designation || ROLE_LABELS[person.role]} · {person.hoursPerDay}h/day
                      {(work[person.id]?.length ?? 0) > 0 ? ` · on ${work[person.id].map((b) => b.projectName).join(", ")}` : ""}
                    </span>
                  </span>
                  <span className={`text-xs font-medium whitespace-nowrap ${later ? "text-brand-yellowText" : "text-brand-greenText"}`}>
                    {later ? `free from ${fmtDay(from)}` : "free now"}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {reservedHere.length > 0 && (
          <div className="rounded border border-dashed border-ink-200 p-3">
            <p className={labelCls}>Already in another forecast</p>
            <ul className="mt-1 space-y-1 text-sm text-ink-700">
              {reservedHere.map((p) => {
                const f = reservedElsewhere.get(p.id)!;
                const pn = data.projects.find((x) => x.id === f.projectId)?.name ?? "another project";
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-ink-500">{pn} · {f.track}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => clear(f.projectId, f.track, p.id)}
                      className="text-xs text-brand-blue hover:underline"
                    >
                      release
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {saved && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => clear(saved.projectId, saved.track)}>
              Clear forecast
            </button>
          )}
          <button
            type="button"
            className="btn-primary !bg-violet-600 hover:!bg-violet-700"
            disabled={busy || chosen.size === 0 || !project || !dirty}
            onClick={build}
          >
            {saved ? (dirty ? `Update forecast (${chosen.size})` : `Forecast saved (${chosen.size})`) : `Build forecast (${chosen.size})`}
          </button>
        </div>
      </div>

      {/* Result */}
      {chosen.size > 0 && project && (
        <>
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-card border px-3 py-2 text-sm ${
              saved && !dirty
                ? "border-violet-200 bg-violet-50 text-violet-900"
                : "border-ink-200 bg-ink-50 text-ink-700"
            }`}
          >
            <span>
              {saved && !dirty
                ? `Forecast saved — these ${saved.memberIds.length} people are reserved and hidden from other projects' forecasts.`
                : "Preview — not saved yet. Build the forecast to reserve these people."}
            </span>
          </div>

          {target ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatTile label="Balance" value={fmtHours(effort)} />
                <StatTile label="Target" value={fmtDay(target)} />
                <StatTile
                  label="Forecast finish"
                  value={fmtDay(summary.endDate)}
                  tone={summary.late ? "text-brand-yellowText" : "text-brand-blue"}
                />
                <StatTile label="Free now" value={summary.freeNow} tone="text-brand-blue" />
                <StatTile
                  label="Joining later"
                  value={summary.joiningLater}
                  tone={summary.joiningLater ? "text-brand-yellowText" : "text-ink-900"}
                />
                <StatTile
                  label="Need to hire"
                  value={summary.hires}
                  tone={summary.hires ? "text-brand-redText" : "text-brand-blue"}
                />
              </div>
              {summary.late ? (
                <p className="rounded-card border border-brand-yellowBorder bg-brand-yellowBg px-3 py-2 text-sm text-brand-yellowText">
                  {summary.endDate
                    ? `Forecast ${fmtDay(summary.endDate)} is later than ${fmtDay(target)}`
                    : "These people have no capacity in the window"}{" "}
                  — the people free now plus those joining mid-way are not enough.{" "}
                  <strong>Hire {summary.hires} more</strong> ({setup.track}, joining from {fmtDay(start)}) to meet the target.
                </p>
              ) : (
                <p className="rounded-card border border-brand-blue/30 bg-brand-blueBg px-3 py-2 text-sm text-brand-blue">
                  On time — {summary.contributing.length} {summary.contributing.length === 1 ? "person" : "people"} ({summary.freeNow} free now,{" "}
                  {summary.joiningLater} joining later) finish by {fmtDay(summary.endDate)} in {summary.days} working days.
                </p>
              )}
            </>
          ) : (
            <p className="card p-4 text-center text-sm text-ink-500">
              Forecast finish: <strong>{fmtDay(summary.endDate)}</strong>
              {summary.days != null ? ` (${summary.days} working days)` : ""}. Enter a target date to see whether these people are
              enough — and how many to hire if not.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-700">
              <span className="mr-2 inline-block h-3 w-3 rounded-sm bg-violet-400 align-middle" />
              working on {project.name} ({setup.track}) · busy people appear from the day they free up
            </p>
            <PeriodControls view={view} setView={setView} />
          </div>
          <EngagementGrid
            rows={members.map((m) => {
              const p = data.people.find((x) => x.id === m.id)!;
              return { id: m.id, label: p.shortName };
            })}
            periods={periods}
            gran={view.gran}
            today={today}
            work={work}
            forecast={forecastBlocks}
            leaves={leaves}
          />
          <GridLegend forecast />
        </>
      )}

      <p className="text-xs text-ink-500">
        What-if only — nothing is assigned. Ticked people who are free start on the start date; busy ones join the working day
        after their current work ends. Capacity is each person&apos;s weekly capacity spread over the working days, less approved
        leave.
      </p>

      <TeamsPanel data={data} reload={reload} />
    </div>
  );
}

/** All saved forecasts at a glance — the upcoming resource requirement —
 *  with finished projects' forecasts kept apart under "Completed". */
function ForecastList({
  data,
  work,
  leaves,
  onOpen,
  onDelete,
  active,
}: {
  data: EngagementData;
  work: Record<string, EngagementBlock[]>;
  leaves: Record<string, LeaveBlock[]>;
  onOpen: (projectId: number, track: Track) => void;
  onDelete: (f: SavedForecast) => Promise<void>;
  active: Setup;
}) {
  const workDays = useWorkDays(data);
  const confirm = useConfirm();
  const [tab, setTab] = useState<"upcoming" | "completed">("upcoming");
  if (data.forecasts.length === 0) return null;

  const upcoming = data.forecasts.filter((f) => !f.completed);
  const completed = data.forecasts.filter((f) => f.completed);
  const shown = tab === "upcoming" ? upcoming : completed;

  const rows = shown.map((f) => {
    const fStart = nextWorkingDay(f.startDate, workDays);
    const members: ForecastMember[] = f.memberIds
      .map((id) => data.people.find((p) => p.id === id))
      .filter((p): p is EngagementPerson => !!p)
      .map((p) => ({
        id: p.id,
        from: nextWorkingDay(maxISO(fStart, freeFrom(work[p.id], data.today, workDays)), workDays),
        hoursPerDay: p.hoursPerDay,
        leaves: leaves[p.id],
      }));
    const s = summariseForecast(f.effortHours, members, fStart, f.targetDate, workDays, data.hoursPerDay || 8);
    return { f, s };
  });
  const totalHires =
    tab === "upcoming"
      ? rows.reduce((n, r) => n + (typeof r.s.hires === "number" ? r.s.hires : 50), 0)
      : 0;

  async function remove(f: SavedForecast) {
    const people = f.memberIds.length === 1 ? "person is" : "people are";
    const ok = await confirm({
      title: "Delete this forecast?",
      body: `${f.projectName} · ${f.track} — ${f.memberIds.length} reserved ${people} released. No task or assignment is touched.`,
      confirmLabel: "Delete forecast",
      danger: true,
    });
    if (ok) await onDelete(f);
  }

  const tabBtn = (id: "upcoming" | "completed", label: string, count: number) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded px-3 py-1 text-sm font-medium ${
        tab === id ? "bg-brand-blue text-white" : "text-ink-700 hover:bg-ink-100"
      }`}
    >
      {label} <span className="text-xs opacity-75">({count})</span>
    </button>
  );

  return (
    <section className="card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-base font-semibold">Resource requirements</h2>
          <div className="flex rounded border border-ink-200 bg-white p-0.5">
            {tabBtn("upcoming", "Upcoming", upcoming.length)}
            {tabBtn("completed", "Completed", completed.length)}
          </div>
        </div>
        {tab === "upcoming" && rows.length > 0 && (
          <span className="text-xs text-ink-500">
            {totalHires ? (
              <span className="text-brand-redText font-medium">
                {totalHires} hire{totalHires === 1 ? "" : "s"} needed
              </span>
            ) : (
              "no hiring needed"
            )}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-400">
          {tab === "upcoming"
            ? "No upcoming forecasts — build one below."
            : "No completed forecasts yet. A forecast moves here when its project is marked Delivered."}
        </p>
      ) : (
        <table className="w-full text-sm mt-2">
          <thead className="bg-ink-50 text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-left font-medium">Track</th>
              <th className="px-3 py-2 text-center font-medium">People</th>
              <th className="px-3 py-2 text-center font-medium">Effort</th>
              <th className="px-3 py-2 text-center font-medium">Start</th>
              <th className="px-3 py-2 text-center font-medium">Target</th>
              {tab === "upcoming" && <th className="px-3 py-2 text-center font-medium">Forecast finish</th>}
              <th className="px-3 py-2 text-center font-medium">Status</th>
              <th className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, s }) => {
              const isActive = !f.completed && active.projectId === f.projectId && active.track === f.track;
              return (
                <tr
                  key={keyOf(f.projectId, f.track)}
                  onClick={f.completed ? undefined : () => onOpen(f.projectId, f.track)}
                  title={f.completed ? undefined : "Open this forecast"}
                  className={`border-t border-ink-100 ${f.completed ? "" : "cursor-pointer"} ${
                    isActive ? "bg-violet-50" : "hover:bg-ink-50"
                  }`}
                >
                  <td className="px-4 py-2 font-medium">{f.projectName}</td>
                  <td className="px-3 py-2">
                    <span className={TRACK_PILL[f.track]}>{f.track}</span>
                  </td>
                  <td className="px-3 py-2 text-center">{f.memberIds.length}</td>
                  <td className="px-3 py-2 text-center">{fmtHours(f.effortHours)}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">{fmtDay(f.startDate)}</td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">{fmtDay(f.targetDate)}</td>
                  {tab === "upcoming" && (
                    <td className="px-3 py-2 text-center whitespace-nowrap">{fmtDay(s.endDate)}</td>
                  )}
                  <td className="px-3 py-2 text-center">
                    {f.completed ? (
                      <span className="pill-grey inline-flex items-center gap-1">
                        <CheckCircle2 size={12} /> Project delivered
                      </span>
                    ) : !f.targetDate ? (
                      <span className="pill-grey">No target</span>
                    ) : s.late ? (
                      <span className="pill-red">Late · hire {s.hires}</span>
                    ) : (
                      <span className="pill-green">On time</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Delete forecast for ${f.projectName} (${f.track})`}
                      title="Delete forecast"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(f);
                      }}
                      className="p-1.5 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Put developers / leads on the Application or Plugin track. */
function TeamsPanel({ data, reload }: { data: EngagementData; reload: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const doers = data.people.filter((p) => (FORECAST_ROLES as readonly string[]).includes(p.role));
  const unassigned = doers.filter((p) => !p.track).length;

  async function setTrack(p: EngagementPerson, track: string) {
    setSaving(p.id);
    const r = await fetch("/api/engagement/track", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: p.id, track: track || null }),
    });
    setSaving(null);
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      toast.show(b.error ?? "Couldn't change the track.", "error");
      return;
    }
    toast.show(`${p.shortName} → ${track || "no track"}`, "success");
    await reload();
  }

  const column = (title: string, list: EngagementPerson[], tone: string) => (
    <div className="rounded border border-ink-200">
      <div className={`px-3 py-2 border-b border-ink-200 text-sm font-semibold ${tone}`}>
        {title} <span className="text-ink-400 font-normal">({list.length})</span>
      </div>
      <ul className="divide-y divide-ink-100">
        {list.length === 0 && <li className="px-3 py-3 text-xs text-ink-400">Nobody yet.</li>}
        {list.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="min-w-0">
              <span className="block text-sm truncate">{p.name}</span>
              <span className="block text-[11px] text-ink-500">{p.designation || ROLE_LABELS[p.role]}</span>
            </span>
            <select
              aria-label={`Track for ${p.name}`}
              disabled={saving === p.id}
              className={`${inputCls} !h-8 text-xs`}
              value={p.track ?? ""}
              onChange={(e) => setTrack(p, e.target.value)}
            >
              <option value="">No track</option>
              {TRACKS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="card p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2">
          <Users2 size={16} className="text-brand-blue" />
          <span className="font-heading font-semibold">Application &amp; Plugin teams</span>
          <span className="text-xs text-ink-500">
            {doers.filter((p) => p.track === "Application").length} Application ·{" "}
            {doers.filter((p) => p.track === "Plugin").length} Plugin
            {unassigned ? <span className="text-brand-yellowText"> · {unassigned} without a track</span> : null}
          </span>
        </span>
        <span className="text-sm text-brand-blue">{open ? "Hide" : "Manage"}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {column("Application", doers.filter((p) => p.track === "Application"), "text-brand-blue")}
          {column("Plugin", doers.filter((p) => p.track === "Plugin"), "text-brand-greenText")}
          {column("No track", doers.filter((p) => !p.track), "text-ink-700")}
        </div>
      )}
    </section>
  );
}

