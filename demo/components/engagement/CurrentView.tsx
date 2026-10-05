"use client";

import { useMemo, useState } from "react";
import { Search, UserX } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ROLE_LABELS } from "@/lib/role";
import {
  blocksIn,
  fmtDay,
  freeFrom,
  TRACKS,
  type EngagementBlock,
} from "@/lib/engagement";
import { EngagementGrid, GridLegend } from "./EngagementGrid";
import {
  byUser,
  fmtHours,
  inputCls,
  PeriodControls,
  StatTile,
  TRACK_PILL,
  useGridView,
  usePeriods,
  useWorkDays,
  type EngagementData,
  type EngagementPerson,
} from "./shared";

type TrackFilter = "" | "Application" | "Plugin" | "none";
/** Availability today: everyone, people with open work, or people with none. */
type ShowFilter = "" | "engaged" | "free";

export function CurrentView({ data }: { data: EngagementData }) {
  const workDays = useWorkDays(data);
  const today = data.today;
  const work = useMemo(() => byUser(data.blocks), [data.blocks]);
  const leaves = useMemo(() => byUser(data.leaves), [data.leaves]);

  const [query, setQuery] = useState("");
  const [track, setTrack] = useState<TrackFilter>("");
  const [role, setRole] = useState("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [show, setShow] = useState<ShowFilter>("");
  const [selected, setSelected] = useState<EngagementPerson | null>(null);
  const { view, setView } = useGridView(today);
  const periods = usePeriods(view, workDays);

  // When a project filter is on, only that project's blocks count.
  const scopedWork = useMemo(() => {
    if (projectId === "") return work;
    const out: Record<string, EngagementBlock[]> = {};
    for (const [k, v] of Object.entries(work)) {
      out[k] = v.filter((b) => b.projectId === projectId);
    }
    return out;
  }, [work, projectId]);

  const engagedToday = (id: string) => blocksIn(scopedWork[id], today, today).length > 0;
  const onLeaveToday = (id: string) => blocksIn(leaves[id], today, today).length > 0;

  // Every filter except availability — the availability buttons count
  // against this list, so their numbers don't change when you click one.
  const base = data.people.filter((p) => {
    if (track === "none" ? p.track !== null : track && p.track !== track) return false;
    if (role && p.role !== role) return false;
    if (projectId !== "" && !(scopedWork[p.id]?.length)) return false;
    const q = query.trim().toLowerCase();
    if (q) {
      const hay = [
        p.name,
        p.designation,
        p.track ?? "",
        ROLE_LABELS[p.role],
        ...(work[p.id] ?? []).map((b) => b.projectName),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const people = base.filter((p) =>
    show === "engaged" ? engagedToday(p.id) : show === "free" ? !engagedToday(p.id) : true,
  );

  const engagedCount = base.filter((p) => engagedToday(p.id)).length;
  const freePeople = base.filter((p) => !engagedToday(p.id));
  const leaveCount = people.filter((p) => onLeaveToday(p.id)).length;
  const overdue = people.reduce((s, p) => s + (data.workload[p.id]?.overdueTasks ?? 0), 0);
  const avgUtil = people.length
    ? Math.round(
        people.reduce((s, p) => s + (data.workload[p.id]?.utilization30 ?? 0), 0) /
          people.length,
      )
    : 0;
  const filtered = !!(query || track || role || projectId !== "");

  const freeFromOf = (id: string) => freeFrom(work[id], today, workDays);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="People" value={base.length} />
        <StatTile
          label="Busy today"
          value={engagedCount}
          tone="text-brand-blue"
          hint="People with at least one open task running today."
        />
        <StatTile
          label="Available today"
          value={freePeople.length}
          tone={freePeople.length ? "text-brand-greenText" : "text-ink-900"}
          hint="Active people with no open task today — available to pick up work."
        />
        <StatTile
          label="On leave today"
          value={leaveCount}
          tone={leaveCount ? "text-brand-yellowText" : "text-ink-900"}
        />
        <StatTile
          label="Overdue tasks"
          value={overdue}
          tone={overdue ? "text-brand-redText" : "text-ink-900"}
        />
        <StatTile
          label="Avg utilization (30d)"
          value={`${avgUtil}%`}
          hint="Hours logged in the last 30 days ÷ working capacity, averaged over the people shown."
        />
      </section>

      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search person, project, track…"
            className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>
        <select aria-label="Track" className={inputCls} value={track} onChange={(e) => setTrack(e.target.value as TrackFilter)}>
          <option value="">All tracks</option>
          {TRACKS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          <option value="none">No track</option>
        </select>
        <select aria-label="Role" className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="Developer">Developers</option>
          <option value="Lead">Leads</option>
          <option value="Coordinator">Co-ordinators</option>
        </select>
        <select
          aria-label="Project"
          className={`${inputCls} max-w-[220px]`}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">All projects</option>
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="basis-full flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-medium text-ink-500">Availability today:</span>
          {(
            [
              ["", "Everyone", base.length, "Show everyone"],
              ["engaged", "Busy", engagedCount, "Only people who have an open task today"],
              ["free", "Available", freePeople.length, "Only people with no task today — free to take new work"],
            ] as const
          ).map(([value, label, count, hint]) => (
            <button
              key={value}
              type="button"
              title={hint}
              onClick={() => setShow(value)}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-sm ${
                show === value
                  ? value === "free"
                    ? "border-brand-green bg-brand-greenBg text-brand-greenText font-medium"
                    : "border-brand-blue bg-brand-blueBg text-brand-blue font-medium"
                  : "border-ink-200 text-ink-700 hover:bg-ink-100"
              }`}
            >
              {value === "engaged" && <span className="h-2 w-2 rounded-full bg-brand-blue" />}
              {value === "free" && <span className="h-2 w-2 rounded-full bg-brand-green" />}
              {label} <span className="text-xs opacity-70">({count})</span>
            </button>
          ))}
        </div>
      </div>

      {freePeople.length > 0 && show !== "engaged" && (
        <div className="card p-3">
          <div className="flex items-center gap-2 text-sm text-ink-700 mb-2">
            <UserX size={15} className="text-brand-greenText" />
            <span>
              <strong>{freePeople.length}</strong> {freePeople.length === 1 ? "person has" : "people have"} no
              task right now{filtered ? " (for the selected filters)" : ""}:
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {freePeople.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className="pill-green hover:ring-1 hover:ring-brand-green"
                title={onLeaveToday(p.id) ? "On leave today" : "Free now"}
              >
                {p.shortName}
                {onLeaveToday(p.id) ? " · on leave" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-700">
          Today: <strong className="text-brand-blue">{engagedCount}</strong> busy ·{" "}
          <strong className="text-brand-greenText">{freePeople.length}</strong> available
          {filtered ? " (for the selected filters)" : ""}
        </p>
        <PeriodControls view={view} setView={setView} />
      </div>
      <EngagementGrid
        rows={people.map((p) => ({
          id: p.id,
          label: p.shortName,
          tag: p.track ? <span className={`${TRACK_PILL[p.track]} !px-2 !py-0 text-[10px]`}>{p.track}</span> : undefined,
        }))}
        periods={periods}
        gran={view.gran}
        today={today}
        work={scopedWork}
        leaves={leaves}
        onSelect={(id) => setSelected(data.people.find((p) => p.id === id) ?? null)}
      />
      <GridLegend />

      {selected && (
        <PersonDetail
          person={selected}
          data={data}
          freeFromDay={freeFromOf(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function PersonDetail({
  person,
  data,
  freeFromDay,
  onClose,
}: {
  person: EngagementPerson;
  data: EngagementData;
  freeFromDay: string;
  onClose: () => void;
}) {
  const blocks = data.blocks
    .filter((b) => b.userId === person.id)
    .sort((a, b) => a.end.localeCompare(b.end));
  const leaves = data.leaves
    .filter((l) => l.userId === person.id && l.end >= data.today)
    .sort((a, b) => a.start.localeCompare(b.start));
  const reserved = data.forecasts.filter((f) => !f.completed && f.memberIds.includes(person.id));

  return (
    <Modal title={person.name} onClose={onClose} size="lg">
      <p className="text-sm text-ink-500 mb-4">
        {person.designation || ROLE_LABELS[person.role]}
        {person.track ? ` · ${person.track} track` : " · no track"} · {person.hoursPerDay}h/day ·{" "}
        {freeFromDay <= data.today ? (
          <span className="text-brand-greenText font-medium">free now</span>
        ) : (
          <span className="text-brand-yellowText font-medium">free from {fmtDay(freeFromDay)}</span>
        )}
      </p>

      <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Engagements</h3>
      {blocks.length === 0 ? (
        <p className="text-sm text-ink-400 mt-1 mb-4">Not engaged on any project — available now.</p>
      ) : (
        <ul className="mt-1 mb-4 space-y-2">
          {blocks.map((b) => (
            <li key={b.projectId} className="rounded border border-ink-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{b.projectName}</span>
                <span className="text-xs text-ink-500 whitespace-nowrap">
                  {fmtDay(b.start)} → {fmtDay(b.end)}
                </span>
              </div>
              <div className="text-xs text-ink-500 mt-0.5">
                {b.openTasks} open task{b.openTasks === 1 ? "" : "s"} · {fmtHours(b.remainingHours)} estimated
                {b.overdueTasks ? <span className="text-brand-redText"> · {b.overdueTasks} overdue</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {reserved.length > 0 && (
        <>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Reserved in forecast</h3>
          <ul className="mt-1 mb-4 text-sm text-ink-700 list-disc pl-5">
            {reserved.map((f) => (
              <li key={`${f.projectId}-${f.track}`}>
                {f.projectName} · {f.track} (from {fmtDay(f.startDate)})
              </li>
            ))}
          </ul>
        </>
      )}

      {leaves.length > 0 && (
        <>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Upcoming leave</h3>
          <ul className="mt-1 text-sm text-ink-700 list-disc pl-5">
            {leaves.map((l, i) => (
              <li key={i}>
                {l.type}: {fmtDay(l.start)}
                {l.end !== l.start ? ` → ${fmtDay(l.end)}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

