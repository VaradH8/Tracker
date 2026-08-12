"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";
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
  resources?: { id: string; name: string; startDate: string; endDate: string }[];
};

type Person = { id: string; name: string; role: string };

export default function DomainProjectsPage() {
  const { current } = useDomain();
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<number | null>(null);

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

  useEffect(() => {
    void loadProjects();
    fetch("/api/domain/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) => setPeople(b.users ?? []))
      .catch(() => null);
  }, [loadProjects]);


  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-ink-500 mt-1">
            {canAssign
              ? "Open a project to assign and track its tasks."
              : "Open a project to see and update your tasks."}
          </p>
        </div>
        {canCreateProject && (
          <button onClick={() => setCreating((v) => !v)} className="btn-primary">
            <Plus size={16} className="mr-1.5" /> New project
          </button>
        )}
      </div>

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

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-2">
          {projects.length === 0 && (
            <p className="text-sm text-ink-400 italic">No projects yet.</p>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`card p-4 w-full text-left transition ${
                selected === p.id ? "ring-2 ring-brand-blue" : "hover:shadow-md"
              }`}
            >
              <div className="font-medium text-ink-900">{p.name}</div>
              <div className="text-xs text-ink-500 mt-0.5">
                Owner {p.owner} · {p.taskCount} task{p.taskCount === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </div>

        <div>
          {selected == null ? (
            <div className="card p-8 text-center text-sm text-ink-400">
              Select a project to see its tasks.
            </div>
          ) : (
            (() => {
              const project = projects.find((p) => p.id === selected);
              if (!project) return null;
              const canManageProject =
                current?.role === "Admin" || project.ownerId === current?.id;
              return (
                <>
                  <ProjectHeader
                    project={project}
                    canManage={canManageProject}
                    onEdit={() => setEditingProject(project.id)}
                    onDeleted={() => {
                      setSelected(null);
                      setEditingProject(null);
                      void loadProjects();
                    }}
                  />
                  {editingProject === project.id && (
                    <EditProjectForm
                      project={project}
                      people={people}
                      onCancel={() => setEditingProject(null)}
                      onSaved={() => {
                        setEditingProject(null);
                        void loadProjects();
                      }}
                    />
                  )}
                  <TagAssignmentPanel
                    project={project}
                    people={people}
                    canAssign={canAssign}
                    onChanged={loadProjects}
                  />
                  <ProjectTasks
                    projectId={selected}
                    people={people}
                    canAssign={canAssign}
                    onTaskChange={loadProjects}
                  />
                </>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectHeader({
  project,
  canManage,
  onEdit,
  onDeleted,
}: {
  project: Project;
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

  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-semibold truncate">
          {project.name}
        </h2>
        {project.description && (
          <p className="text-sm text-ink-500 mt-0.5">{project.description}</p>
        )}
        <p className="text-xs text-ink-400 mt-0.5">
          Owner {project.owner}
          {project.client && ` · Client ${project.client}`}
          {project.handoverDate && ` · Handover ${project.handoverDate}`}
          {project.totalTags ? ` · ${project.totalTags} tags` : ""}
        </p>
      </div>
      {canManage && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 rounded text-ink-500 hover:bg-ink-100"
            title="Edit project"
          >
            <Pencil size={15} />
          </button>
          <ConfirmButton
            onConfirm={remove}
            title="Delete project (and its tasks)"
            confirmLabel="Delete project?"
            className="p-1.5 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
          >
            <Trash2 size={15} />
          </ConfirmButton>
        </div>
      )}
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
        <div className="flex flex-wrap gap-1.5 mb-3">
          {assignable.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                className={`px-2.5 py-1 rounded-pill text-xs font-medium border transition ${
                  on
                    ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                    : "bg-white text-ink-600 border-ink-200 hover:bg-ink-100"
                }`}
              >
                {p.name}
                {on && validCount ? ` · ${previewFor(p.id)}` : ""}
              </button>
            );
          })}
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
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="px-3 py-2 rounded border border-ink-200 text-sm"
                >
                  <option value="">Assign to…</option>
                  {assignable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({DOMAIN_ROLE_LABELS[p.role as DomainRole]})
                    </option>
                  ))}
                </select>
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