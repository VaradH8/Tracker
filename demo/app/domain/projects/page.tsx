"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useDomain } from "@/lib/domain-store";
import { DomainTaskList, type DomainTask } from "@/components/DomainTaskList";

type Project = {
  id: number;
  name: string;
  description: string | null;
  owner: string;
  taskCount: number;
};

type Person = { id: string; name: string; role: string };

export default function DomainProjectsPage() {
  const { current } = useDomain();
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  async function createProject() {
    setError(null);
    const res = await fetch("/api/domain/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: desc }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't create project.");
      return;
    }
    setName("");
    setDesc("");
    setCreating(false);
    void loadProjects();
  }

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
        <div className="card p-4 mb-6">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="w-full px-3 py-2 mb-2 rounded border border-ink-200 text-sm"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 mb-2 rounded border border-ink-200 text-sm"
          />
          {error && <p className="text-xs text-brand-redText mb-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              onClick={createProject}
              disabled={!name.trim()}
              className="btn-primary"
            >
              Create
            </button>
          </div>
        </div>
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
            <ProjectTasks
              projectId={selected}
              people={people}
              canAssign={canAssign}
              onTaskChange={loadProjects}
            />
          )}
        </div>
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
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const assignable = people.filter(
    (p) => p.role === "Actionee" || p.role === "TeamLead",
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
        targetDate: targetDate || undefined,
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't add task.");
      return;
    }
    setTitle("");
    setAssigneeId("");
    setTargetDate("");
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
                      {p.name} ({p.role === "TeamLead" ? "Team Lead" : "Actionee"})
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="px-3 py-2 rounded border border-ink-200 text-sm"
                />
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
          ) : (
            <button onClick={() => setAdding(true)} className="btn-primary">
              <Plus size={16} className="mr-1.5" /> Add task
            </button>
          )}
        </div>
      )}
      <DomainTaskList
        tasks={tasks}
        canManage={canAssign}
        hideProject
        onChanged={() => {
          void load();
          onTaskChange();
        }}
      />
    </div>
  );
}