"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Layers,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { useDomain } from "@/lib/domain-store";
import {
  DOMAIN_ROLE_LABELS,
  MAX_BULK_TASKS,
  distributeEvenly,
  type DomainRole,
} from "@/lib/domain";
import { DomainTaskList, type DomainTask } from "@/components/DomainTaskList";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  CreateProjectForm,
  EditProjectForm,
  TagAssignmentPanel,
} from "@/components/DomainProjectForecast";
import {
  ResourceChecklist,
  ResourceDetail,
  ResourceSelect,
  useAvailability,
} from "@/components/DomainResourcePicker";
import { DomainProjectResources } from "@/components/DomainProjectResources";
import { DomainPage, PageHeader } from "@/components/DomainPage";

type Project = {
  id: number;
  name: string;
  description: string | null;
  owner: string;
  ownerId: string;
  taskCount: number;
  startDate?: string | null;
  handoverDate?: string | null;
  totalTags?: number;
  client?: string | null;
  divisions?: { id: number; name: string; totalTags: number }[];
  resources?: {
    allocationId: number;
    id: string;
    name: string;
    role?: string;
    startDate: string;
    endDate: string;
    releasedAt: string | null;
    expectedTagsPerDay: number | null;
  }[];
  assignedTags?: number;
  deliveredTags?: number;
  peopleEngaged?: number;
};

type Person = { id: string; name: string; role: string };

type AssignmentRow = {
  id: number;
  assigneeId: string;
  assigneeName: string;
  divisionId: number | null;
  divisionName: string | null;
  assignedCount: number;
  deliveredCount: number;
  pendingCount: number;
  startDate: string | null;
  targetDate: string | null;
};

export default function DomainProjectsPage() {
  const { current } = useDomain();
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [query, setQuery] = useState("");

  const canCreateProject =
    current?.role === "Admin" || current?.role === "Lead";
  const canAssign =
    current?.role === "Admin" ||
    current?.role === "Lead" ||
    current?.role === "TeamLead";

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/domain/projects", { cache: "no-store" });
    if (res.ok) setProjects((await res.json()).projects ?? []);
  }, []);

  // Held here rather than inside the tags panel: the project header needs
  // the same totals, and one fetch beats two.
  const loadAssignments = useCallback(async () => {
    if (selected == null) {
      setAssignments([]);
      return;
    }
    const res = await fetch(`/api/domain/tag-assignments?projectId=${selected}`, {
      cache: "no-store",
    });
    setAssignments(res.ok ? ((await res.json()).assignments ?? []) : []);
  }, [selected]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    void loadProjects();
    fetch("/api/domain/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) => setPeople(b.users ?? []))
      .catch(() => null);
  }, [loadProjects]);

  // Deep link: /domain/projects?project=12 opens that project directly, so a
  // card on the dashboard can land you on the right board. Read from
  // location rather than useSearchParams to avoid needing a Suspense
  // boundary around the whole page.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("project"));
    if (Number.isFinite(id) && id > 0) setSelected(id);
  }, []);


  const selectedProject =
    selected == null ? null : (projects.find((p) => p.id === selected) ?? null);

  // ------------------------------------------------------------------
  // Detail: one project, full width. The list is a step back, not a rail
  // beside it — the app already has a sidebar, and a second one alongside
  // squeezed everything into a narrow column.
  // ------------------------------------------------------------------
  if (selectedProject) {
    const canManageProject =
      current?.role === "Admin" || current?.role === "Lead";
    return (
      <DomainPage width="wide">
        <button
          onClick={() => {
            setSelected(null);
            setEditingProject(null);
          }}
          className="text-sm text-brand-blue inline-flex items-center gap-1 mb-3"
        >
          <ChevronLeft size={14} /> All projects
        </button>

        <ProjectHeader
          project={selectedProject}
          assignments={assignments}
          canManage={canManageProject}
          onEdit={() => setEditingProject(selectedProject.id)}
          onDeleted={() => {
            setSelected(null);
            setEditingProject(null);
            void loadProjects();
          }}
        />
        {editingProject === selectedProject.id && (
          <EditProjectForm
            project={selectedProject}
            people={people}
            onCancel={() => setEditingProject(null)}
            onSaved={() => {
              setEditingProject(null);
              void loadProjects();
            }}
          />
        )}
        <DomainProjectResources
          projectId={selectedProject.id}
          projectStart={selectedProject.startDate ?? null}
          projectEnd={selectedProject.handoverDate ?? null}
          resources={selectedProject.resources ?? []}
          people={people}
          canManage={canManageProject}
          onChanged={() => {
            void loadProjects();
            void loadAssignments();
          }}
        />
        <TagAssignmentPanel
          project={selectedProject}
          people={people}
          canAssign={canAssign}
          rows={assignments}
          onChanged={() => {
            void loadAssignments();
            void loadProjects();
          }}
        />
        <ProjectTasks
          projectId={selectedProject.id}
          people={people}
          canAssign={canAssign}
          onTaskChange={loadProjects}
        />
      </DomainPage>
    );
  }

  // ------------------------------------------------------------------
  // Index: every project as a card you can read at a glance.
  // ------------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const shown = projects.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.client ?? "").toLowerCase().includes(q),
  );

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Projects"
        description={
          canAssign
            ? "Open a project to set its scope, assign tags and track delivery."
            : "Open a project to see the work you're carrying on it."
        }
        actions={
          canCreateProject ? (
            <button onClick={() => setCreating((v) => !v)} className="btn-primary">
              <Plus size={16} className="mr-1.5" /> New project
            </button>
          ) : null
        }
      />

      {creating && (
        <CreateProjectForm
          people={people}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void loadProjects();
          }}
        />
      )}

      {projects.length > 4 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a project or client"
          className="px-3 py-1.5 rounded border border-ink-200 text-sm w-72 mb-4"
        />
      )}

      {projects.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-500">
            No projects yet.
            {canCreateProject && " Create the first one to start tracking tags."}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-400 italic">Nothing matches that search.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((p) => (
            <ProjectCard key={p.id} p={p} onOpen={() => setSelected(p.id)} />
          ))}
        </div>
      )}
    </DomainPage>
  );
}

/** One project on the index: scope, progress and dates at a glance. */
function ProjectCard({ p, onOpen }: { p: Project; onOpen: () => void }) {
  const total = p.totalTags || p.assignedTags || 0;
  const delivered = p.deliveredTags ?? 0;
  const pct = total > 0 ? (delivered / total) * 100 : 0;
  const unassigned = Math.max(0, (p.totalTags ?? 0) - (p.assignedTags ?? 0));

  return (
    <button
      onClick={onOpen}
      className="card p-5 text-left hover:shadow-md transition flex flex-col"
    >
      <div className="min-w-0">
        <h3 className="font-heading font-semibold text-ink-900 truncate">
          {p.name}
        </h3>
        <p className="text-xs text-ink-500 mt-0.5 truncate">
          {p.client ? `${p.client} · ` : ""}Owner {p.owner}
        </p>
      </div>

      {total > 0 ? (
        <>
          <div className="flex items-baseline gap-2 mt-4">
            <span className="font-heading text-2xl font-semibold text-brand-greenText">
              {delivered}
            </span>
            <span className="text-sm text-ink-500">of {total} tags</span>
            <span className="ml-auto text-sm font-medium text-ink-700">
              {Math.round(pct)}%
            </span>
          </div>
          <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden mt-2">
            <div
              className="h-full bg-brand-green"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-400 italic mt-4">No tags set up yet</p>
      )}

      <div className="flex items-center gap-3 mt-3 text-xs text-ink-500 flex-wrap">
        {p.handoverDate && <span>Handover {fmtDay(p.handoverDate)}</span>}
        {(p.peopleEngaged ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1">
            <Users size={11} /> {p.peopleEngaged}
          </span>
        )}
        {(p.divisions?.length ?? 0) > 0 && (
          <span>{p.divisions!.length} divisions</span>
        )}
      </div>

      {unassigned > 0 && (
        <p className="text-xs text-brand-yellowText mt-2">
          {unassigned} tags not yet assigned
        </p>
      )}

      {/* mt-auto pins this to the bottom of the card. With a fixed margin it
          floated up on cards that lack the "not yet assigned" line, so the
          Open links didn't line up across the row. */}
      <span className="text-sm text-brand-blue inline-flex items-center gap-1 mt-auto pt-4">
        Open <ChevronRight size={14} />
      </span>
    </button>
  );
}

function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function ProjectHeader({
  project,
  assignments,
  canManage,
  onEdit,
  onDeleted,
}: {
  project: Project;
  assignments: AssignmentRow[];
  canManage: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  async function remove() {
    const res = await fetch(`/api/domain/projects/${project.id}`, {
      method: "DELETE",
    });
    if (res.ok) onDeleted();
  }

  const assigned = assignments.reduce((s, r) => s + r.assignedCount, 0);
  const delivered = assignments.reduce((s, r) => s + r.deliveredCount, 0);
  const pending = assignments.reduce((s, r) => s + r.pendingCount, 0);
  const total = project.totalTags || assigned;
  const remaining = Math.max(0, total - delivered);
  const pct = total > 0 ? (delivered / total) * 100 : 0;

  return (
    <div className="card p-6 mb-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold text-ink-900">
            {project.name}
          </h2>
          <p className="text-sm text-ink-500 mt-1.5">
            {project.client && (
              <>
                <span className="text-ink-700 font-medium">{project.client}</span>
                {" · "}
              </>
            )}
            Owner <span className="text-ink-700">{project.owner}</span>
            {project.startDate && (
              <>
                {" · "}Start{" "}
                <span className="text-ink-700">{project.startDate}</span>
              </>
            )}
            {project.handoverDate && (
              <>
                {" · "}Handover{" "}
                <span className="text-ink-700 font-medium">
                  {project.handoverDate}
                </span>
              </>
            )}
          </p>
          {project.description && (
            <p className="text-sm text-ink-500 mt-2 max-w-2xl">
              {project.description}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onEdit}
              className="btn-ghost border border-ink-200 inline-flex items-center gap-1.5"
              title="Edit project"
            >
              <Pencil size={14} /> Edit
            </button>
            <ConfirmButton
              onConfirm={remove}
              title="Delete project (and its tasks)"
              confirmLabel="Delete project?"
              className="btn-ghost border border-ink-200 text-brand-redText inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} /> Delete
            </ConfirmButton>
          </div>
        )}
      </div>

      {total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <HeroStat label="Tags total" value={total} />
            <HeroStat label="Delivered" value={delivered} tone="text-brand-greenText" />
            <HeroStat
              label="Pending approval"
              value={pending}
              tone={pending > 0 ? "text-brand-yellowText" : undefined}
            />
            <HeroStat label="Remaining" value={remaining} />
          </div>
          <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden mt-4">
            <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-ink-500 mt-1.5">
            {Math.round(pct)}% delivered
            {assigned < total && (
              <span className="text-brand-yellowText">
                {" · "}
                {total - assigned} tags not yet assigned to anyone
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-card border border-ink-200 px-4 py-3">
      <div className="text-xs text-ink-500 font-medium uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`font-heading text-2xl font-semibold mt-1 ${tone ?? "text-ink-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Create a run of like-for-like tasks ("20 supports") and let the server
 *  spread them evenly over the people picked here — 20 across 4 is 5 each. */
function BulkAddTasks({
  projectId,
  assignable,
  onCancel,
  onCreated,
}: {
  projectId: number;
  assignable: Person[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [prefix, setPrefix] = useState("");
  const [count, setCount] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [estHours, setEstHours] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { byId: availability } = useAvailability();

  const n = Number(count);
  const validCount = Number.isInteger(n) && n >= 1 && n <= MAX_BULK_TASKS;

  // Same round-robin the server runs, so the preview can't disagree with
  // what actually gets created.
  const spread = validCount ? distributeEvenly(n, picked) : [];
  const previewFor = (id: string) => spread.filter((a) => a === id).length;

  function toggle(id: string) {
    setPicked((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  async function submit() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/domain/tasks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        titlePrefix: prefix,
        count: n,
        assigneeIds: picked,
        estimatedHours: estHours || undefined,
        startDate: startDate || undefined,
        targetDate: targetDate || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't create the tasks.");
      return;
    }
    onCreated();
  }

  return (
    <div className="card p-4">
      <div className="grid grid-cols-[1fr_110px] gap-2 mb-2">
        <input
          autoFocus
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="Batch name, e.g. Support or Cable"
          className="px-3 py-2 rounded border border-ink-200 text-sm"
        />
        <input
          type="number"
          min="1"
          max={MAX_BULK_TASKS}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          placeholder="How many"
          className="px-3 py-2 rounded border border-ink-200 text-sm"
        />
      </div>
      {prefix.trim() && validCount && (
        <p className="text-xs text-ink-500 mb-3">
          Creates {n} tasks: {prefix.trim()} 1 … {prefix.trim()} {n}
        </p>
      )}

      <label className="block text-[11px] text-ink-500 mb-1">
        Split evenly across
      </label>
      {assignable.length === 0 ? (
        <p className="text-xs text-ink-400 italic mb-2">
          No one is available to take these on yet.
        </p>
      ) : (
        <div className="mb-3">
          <ResourceChecklist
            people={assignable}
            picked={picked}
            availability={availability}
            onToggle={(id) => toggle(id)}
            maxHeight="max-h-52"
            suffix={(id) =>
              picked.includes(id) && validCount ? (
                <span className="text-xs font-medium text-brand-blue">
                  {previewFor(id)} tasks
                </span>
              ) : null
            }
          />
        </div>
      )}
      {picked.length === 0 && (
        <p className="text-xs text-ink-400 italic mb-3">
          Pick nobody and the tasks are created unassigned.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="block text-[11px] text-ink-500 mb-1">
            Hours per task
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={estHours}
            onChange={(e) => setEstHours(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-ink-500 mb-1">Start date</label>
          <input
            type="date"
            value={startDate}
            max={targetDate || undefined}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] text-ink-500 mb-1">Deadline</label>
          <input
            type="date"
            value={targetDate}
            min={startDate || undefined}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-xs text-brand-redText mb-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!prefix.trim() || !validCount || busy}
          className="btn-primary"
        >
          {busy ? "Creating…" : `Create ${validCount ? n : ""} tasks`}
        </button>
      </div>
    </div>
  );
}

function ProjectTasks({
  projectId,
  people,
  canAssign,
  onTaskChange,
}: {
  projectId: number;
  people: Person[];
  canAssign: boolean;
  onTaskChange: () => void;
}) {
  const [tasks, setTasks] = useState<DomainTask[]>([]);
  const { byId: availability } = useAvailability(canAssign);
  const [adding, setAdding] = useState(false);
  const [bulking, setBulking] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [estHours, setEstHours] = useState("");
  const [error, setError] = useState<string | null>(null);

  const assignable = people.filter((p) =>
    ["Actionee", "TeamLead", "SME"].includes(p.role),
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/domain/tasks?projectId=${projectId}`, {
      cache: "no-store",
    });
    if (res.ok) setTasks((await res.json()).tasks ?? []);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTask() {
    setError(null);
    const res = await fetch("/api/domain/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        title,
        assigneeId: assigneeId || undefined,
        startDate: startDate || undefined,
        targetDate: targetDate || undefined,
        estimatedHours: estHours || undefined,
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't add task.");
      return;
    }
    setTitle("");
    setAssigneeId("");
    setStartDate("");
    setTargetDate("");
    setEstHours("");
    setAdding(false);
    void load();
    onTaskChange();
  }

  return (
    <div>
      {canAssign && (
        <div className="mb-4">
          {adding ? (
            <div className="card p-4">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                className="w-full px-3 py-2 mb-2 rounded border border-ink-200 text-sm"
              />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <ResourceSelect
                  people={assignable}
                  value={assigneeId}
                  onChange={setAssigneeId}
                  availability={availability}
                  placeholder="Assign to…"
                  className="px-3 py-2 rounded border border-ink-200 text-sm"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={estHours}
                  onChange={(e) => setEstHours(e.target.value)}
                  placeholder="Hours to complete"
                  className="px-3 py-2 rounded border border-ink-200 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[11px] text-ink-500 mb-1">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    max={targetDate || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-ink-500 mb-1">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    min={startDate || undefined}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
                  />
                </div>
              </div>
              <ResourceDetail a={availability.get(assigneeId)} />
              {error && <p className="text-xs text-brand-redText mb-2">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(false)} className="btn-ghost">
                  Cancel
                </button>
                <button
                  onClick={addTask}
                  disabled={!title.trim()}
                  className="btn-primary"
                >
                  Add task
                </button>
              </div>
            </div>
          ) : bulking ? (
            <BulkAddTasks
              projectId={projectId}
              assignable={assignable}
              onCancel={() => setBulking(false)}
              onCreated={() => {
                setBulking(false);
                void load();
                onTaskChange();
              }}
            />
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setAdding(true)} className="btn-primary">
                <Plus size={16} className="mr-1.5" /> Add task
              </button>
              <button onClick={() => setBulking(true)} className="btn-ghost">
                <Layers size={16} className="mr-1.5" /> Bulk add &amp; split
              </button>
            </div>
          )}
        </div>
      )}
      <DomainTaskList
        tasks={tasks}
        canManage={canAssign}
        people={people}
        hideProject
        onChanged={() => {
          void load();
          onTaskChange();
        }}
      />
    </div>
  );
}