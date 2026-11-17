"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Flag,
  Pencil,
  Play,
  Plus,
  Repeat,
  Square,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";
import { useProjects } from "@/lib/projects-store";
import { useRole } from "@/lib/role";
import {
  formatDateLong,
  priorityPill,
  statusPill,
  todayISO,
  type Priority,
  type Status,
} from "@/lib/mock";
import type { UiSprint } from "@/lib/sprints-ui";

type Candidate = {
  id: number;
  title: string;
  status: string;
  priority: string;
  estimatedHours: number | null;
  sprintName: string | null;
};

const SECTIONS: { status: string; title: string }[] = [
  { status: "active", title: "Active" },
  { status: "planned", title: "Planned" },
  { status: "closed", title: "Closed" },
];

const SPRINT_PILL: Record<string, string> = {
  active: "pill-blue",
  planned: "pill-yellow",
  closed: "pill-grey",
};

async function send(url: string, method: string, body: unknown): Promise<{ sprint?: UiSprint; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : data.error?.message;
    return { error: msg || `Request failed (${res.status})` };
  }
  return data;
}

/** Monday of next week → Friday, the team's default sprint window. */
function nextWeek(): { start: string; end: string } {
  const d = new Date(todayISO() + "T00:00:00");
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const start = iso(d);
  d.setDate(d.getDate() + 4);
  return { start, end: iso(d) };
}

export default function SprintsPage() {
  const { projects } = useProjects();
  const [role] = useRole();
  const canCreate = role === "Admin" || role === "Lead" || role === "Coordinator";

  const [sprints, setSprints] = useState<UiSprint[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<number | "all">("all");
  const [editing, setEditing] = useState<UiSprint | "new" | null>(null);
  const [adding, setAdding] = useState<UiSprint | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sprints", { cache: "no-store" });
      if (!res.ok) throw new Error(`Couldn't load sprints (${res.status})`);
      const data = await res.json();
      setSprints(data.sprints);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const replace = (s: UiSprint) =>
    setSprints((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list];
    });

  const visible = useMemo(
    () => (sprints ?? []).filter((s) => projectFilter === "all" || s.projectId === projectFilter),
    [sprints, projectFilter],
  );
  const projectsWithSprints = useMemo(() => {
    const ids = new Set((sprints ?? []).map((s) => s.projectId));
    return projects.filter((p) => ids.has(p.id));
  }, [sprints, projects]);

  return (
    <AppShell>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Sprints</h1>
            <p className="text-sm text-ink-500 mt-1">Weekly plans per project · planned vs done</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="flex-1 min-w-0 sm:flex-none px-3 py-2 rounded border border-ink-200 text-sm bg-white"
              aria-label="Filter by project"
            >
              <option value="all">All projects</option>
              {projectsWithSprints.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {canCreate && (
              <button onClick={() => setEditing("new")} className="btn-primary whitespace-nowrap shrink-0">
                <Plus size={16} className="mr-1.5" /> New sprint
              </button>
            )}
          </div>
        </div>

        {loadError && <div className="card p-4 mb-4 text-sm text-brand-redText">{loadError}</div>}
        {sprints === null && !loadError && <p className="text-sm text-ink-500">Loading sprints…</p>}
        {sprints !== null && visible.length === 0 && (
          <div className="card p-8 text-center">
            <Repeat size={28} className="mx-auto text-ink-400 mb-3" />
            <p className="text-sm text-ink-700">No sprints yet.</p>
            <p className="text-xs text-ink-500 mt-1">
              {canCreate
                ? "Create one with “New sprint”, then add tasks to it."
                : "Sprints appear here once a Lead or Co-ordinator plans one."}
            </p>
          </div>
        )}

        {sprints !== null &&
          SECTIONS.map(({ status, title }) => {
            const list = visible.filter((s) => s.status === status);
            if (list.length === 0) return null;
            const closed = status === "closed";
            return (
              <section key={status} className="mb-8">
                <button
                  type="button"
                  onClick={() => closed && setShowClosed((v) => !v)}
                  className={`flex items-center gap-2 mb-3 ${closed ? "cursor-pointer" : "cursor-default"}`}
                >
                  {closed && (showClosed ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                  <h2 className="font-heading text-lg font-semibold">{title}</h2>
                  <span className="text-xs text-ink-500">{list.length}</span>
                </button>
                {(!closed || showClosed) && (
                  <div className="space-y-4">
                    {list.map((s) => (
                      <SprintCard
                        key={s.id}
                        sprint={s}
                        defaultOpen={status === "active"}
                        onChange={replace}
                        onEdit={() => setEditing(s)}
                        onAdd={() => setAdding(s)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
      </div>

      {editing && (
        <SprintForm
          sprint={editing === "new" ? null : editing}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          defaultProject={projectFilter === "all" ? undefined : projectFilter}
          onClose={() => setEditing(null)}
          onSaved={(s) => {
            replace(s);
            setEditing(null);
          }}
        />
      )}
      {adding && (
        <AddTasks
          sprint={adding}
          onClose={() => setAdding(null)}
          onSaved={(s) => {
            replace(s);
            setAdding(null);
          }}
        />
      )}
    </AppShell>
  );
}

function SprintCard({
  sprint: s,
  defaultOpen,
  onChange,
  onEdit,
  onAdd,
}: {
  sprint: UiSprint;
  defaultOpen: boolean;
  onChange: (s: UiSprint) => void;
  onEdit: () => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = s.plannedHours > 0 ? Math.round((s.doneHours / s.plannedHours) * 100) : s.plannedTasks > 0 ? Math.round((s.doneTasks / s.plannedTasks) * 100) : 0;
  const unfinished = s.tasks.filter((t) => t.status !== "Done" && t.status !== "Cancelled").length;

  async function run(url: string, method: string, body: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const r = await send(url, method, body);
    setBusy(false);
    if (r.error) setError(r.error);
    else if (r.sprint) onChange(r.sprint);
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-[220px] text-left"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {open ? <ChevronDown size={16} className="text-ink-400" /> : <ChevronRight size={16} className="text-ink-400" />}
            <h3 className="font-heading font-semibold text-ink-900">{s.name}</h3>
            <span className={`${SPRINT_PILL[s.status] ?? "pill-grey"} text-[10px] py-0 capitalize`}>{s.status}</span>
          </div>
          <div className="text-xs text-ink-500 mt-1 ml-6">
            {s.projectName} · {formatDateLong(s.startDate)} → {formatDateLong(s.endDate)}
          </div>
          {s.goal && (
            <div className="text-sm text-ink-700 mt-2 ml-6 flex items-start gap-1.5">
              <Flag size={13} className="mt-0.5 text-ink-400 shrink-0" /> {s.goal}
            </div>
          )}
        </button>

        {s.canManage && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {s.status === "planned" && (
              <button
                disabled={busy}
                onClick={() => run(`/api/sprints/${s.id}`, "PATCH", { status: "active" })}
                className="btn-ghost text-xs"
              >
                <Play size={13} className="mr-1" /> Start
              </button>
            )}
            {s.status === "active" && (
              <button
                disabled={busy}
                onClick={() =>
                  run(
                    `/api/sprints/${s.id}`,
                    "PATCH",
                    { status: "closed" },
                    unfinished
                      ? `${unfinished} task${unfinished === 1 ? " is" : "s are"} not finished. They stay in this sprint until you move them. Close it anyway?`
                      : undefined,
                  )
                }
                className="btn-ghost text-xs"
              >
                <Square size={13} className="mr-1" /> Close
              </button>
            )}
            {s.status === "closed" && (
              <button
                disabled={busy}
                onClick={() => run(`/api/sprints/${s.id}`, "PATCH", { status: "active" })}
                className="btn-ghost text-xs"
              >
                <Play size={13} className="mr-1" /> Reopen
              </button>
            )}
            {s.status !== "closed" && (
              <button disabled={busy} onClick={onAdd} className="btn-ghost text-xs">
                <Plus size={13} className="mr-1" /> Add tasks
              </button>
            )}
            <button disabled={busy} onClick={onEdit} className="btn-ghost text-xs" aria-label="Edit sprint">
              <Pencil size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 ml-6">
        <div className="flex items-center justify-between text-xs text-ink-500 mb-1.5">
          <span>
            {s.doneTasks}/{s.plannedTasks} tasks done · {s.doneHours}/{s.plannedHours}h
          </span>
          <span className="font-medium text-ink-700">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
          <div className="h-full bg-brand-green rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      {error && <p className="text-xs text-brand-redText mt-3 ml-6">{error}</p>}

      {open && (
        <div className="mt-4 ml-6 border-t border-ink-100 pt-3">
          {s.tasks.length === 0 ? (
            <p className="text-sm text-ink-500 italic">
              No tasks in this sprint yet.{s.canManage && s.status !== "closed" ? " Use “Add tasks”." : ""}
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {s.tasks.map((t) => (
                <li key={t.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-xs font-mono text-ink-500 w-20 shrink-0">{t.key}</span>
                  <Link
                    href={`/projects/${s.projectId}`}
                    className={`flex-1 min-w-[160px] truncate hover:text-brand-blue ${t.status === "Cancelled" ? "line-through text-ink-400" : "text-ink-900"}`}
                  >
                    {t.title}
                  </Link>
                  <span className="text-xs text-ink-500 truncate max-w-[160px]">
                    {t.assignees.length ? t.assignees.join(", ") : "Unassigned"}
                  </span>
                  <span className={`${priorityPill(t.priority as Priority)} text-[10px] py-0`}>{t.priority}</span>
                  <span className={`${statusPill(t.status as Status) ?? "pill-grey"} text-[10px] py-0`}>{t.status}</span>
                  <span className="text-xs text-ink-500 w-10 text-right">{t.estimatedHours != null ? `${t.estimatedHours}h` : "—"}</span>
                  {s.canManage && s.status !== "closed" && (
                    <button
                      disabled={busy}
                      onClick={() => run(`/api/sprints/${s.id}/tasks`, "POST", { remove: [t.id] })}
                      className="p-1 rounded text-ink-400 hover:text-brand-redText hover:bg-ink-100"
                      aria-label={`Move ${t.key} to backlog`}
                      title="Move to backlog"
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SprintForm({
  sprint,
  projects,
  defaultProject,
  onClose,
  onSaved,
}: {
  sprint: UiSprint | null;
  projects: { id: number; name: string }[];
  defaultProject?: number;
  onClose: () => void;
  onSaved: (s: UiSprint) => void;
}) {
  const week = nextWeek();
  const [projectId, setProjectId] = useState<number | "">(sprint?.projectId ?? defaultProject ?? "");
  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [startDate, setStart] = useState(sprint?.startDate ?? week.start);
  const [endDate, setEnd] = useState(sprint?.endDate ?? week.end);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!sprint && !projectId) return setError("Pick a project.");
    if (!name.trim()) return setError("Give the sprint a name.");
    if (!startDate || !endDate) return setError("Set both dates.");
    if (endDate < startDate) return setError("The end date is before the start date.");
    setBusy(true);
    setError(null);
    const r = sprint
      ? await send(`/api/sprints/${sprint.id}`, "PATCH", { name, goal, startDate, endDate })
      : await send("/api/sprints", "POST", { projectId, name, goal, startDate, endDate });
    setBusy(false);
    if (r.error) setError(r.error);
    else if (r.sprint) onSaved(r.sprint);
  }

  return (
    <Modal title={sprint ? "Edit sprint" : "New sprint"} onClose={onClose}>
      <div className="space-y-4 mt-4">
        {!sprint && (
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-3 py-2 rounded border border-ink-200 text-sm bg-white"
            >
              <option value="">Choose a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Week of ${formatDateLong(startDate)}`}
            maxLength={200}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">Goal</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="What this sprint should deliver"
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Starts</label>
            <DateInput value={startDate} onChange={setStart} aria-label="Start date" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">Ends</label>
            <DateInput value={endDate} onChange={setEnd} min={startDate} aria-label="End date" />
          </div>
        </div>
        {error && <p className="text-xs text-brand-redText">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-primary">
            {busy ? "Saving…" : sprint ? "Save" : "Create sprint"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddTasks({
  sprint,
  onClose,
  onSaved,
}: {
  sprint: UiSprint;
  onClose: () => void;
  onSaved: (s: UiSprint) => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/sprints/${sprint.id}/tasks`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Couldn't load tasks (${r.status})`))))
      .then((d) => live && setCandidates(d.tasks))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [sprint.id]);

  const shown = (candidates ?? []).filter((t) => !query || t.title.toLowerCase().includes(query.toLowerCase()));
  const pickedHours = (candidates ?? [])
    .filter((t) => picked.has(t.id))
    .reduce((n, t) => n + (t.estimatedHours ?? 0), 0);

  async function save() {
    setBusy(true);
    setError(null);
    const r = await send(`/api/sprints/${sprint.id}/tasks`, "POST", { add: [...picked] });
    setBusy(false);
    if (r.error) setError(r.error);
    else if (r.sprint) onSaved(r.sprint);
  }

  return (
    <Modal title={`Add tasks to ${sprint.name}`} onClose={onClose} size="lg">
      <p className="text-xs text-ink-500 mb-3">
        Open tasks in {sprint.projectName}. Tasks already in another sprint move to this one.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tasks"
        className="w-full px-3 py-2 rounded border border-ink-200 text-sm mb-3"
      />
      {candidates === null && !error && <p className="text-sm text-ink-500">Loading…</p>}
      {candidates !== null && shown.length === 0 && (
        <p className="text-sm text-ink-500 italic">No open tasks to add.</p>
      )}
      <ul className="max-h-[50vh] overflow-y-auto divide-y divide-ink-100 border border-ink-100 rounded">
        {shown.map((t) => (
          <li key={t.id}>
            <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-ink-50">
              <input
                type="checkbox"
                checked={picked.has(t.id)}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    return next;
                  })
                }
              />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-ink-900">{t.title}</span>
                <span className="block text-xs text-ink-500">
                  {t.sprintName ? `In ${t.sprintName}` : "Backlog"} · {t.status}
                  {t.estimatedHours != null ? ` · ${t.estimatedHours}h` : ""}
                </span>
              </span>
              <span className={`${priorityPill(t.priority as Priority)} text-[10px] py-0`}>{t.priority}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-brand-redText mt-3">{error}</p>}
      <div className="flex items-center justify-between gap-2 pt-4">
        <span className="text-xs text-ink-500">
          {picked.size} selected{pickedHours ? ` · ${Math.round(pickedHours * 10) / 10}h` : ""}
        </span>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || picked.size === 0} className="btn-primary">
            {busy ? "Adding…" : "Add to sprint"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
