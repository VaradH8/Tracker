"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import { dateClass, inputClass, selectClass } from "@/lib/domain-ui";

/**
 * Handing out work, from the Task log.
 *
 * This used to live on the project board, which meant a task could only
 * ever belong to a project — there was nowhere to record the ad-hoc work
 * that actually fills a week. Here the project is a choice, including
 * "no project", and the division only appears once a project that has
 * divisions is picked.
 *
 * Assigning to yourself is allowed and is the point of the "myself"
 * option: work you picked up on your own initiative, recorded rather
 * than routed to someone for approval.
 */

type Person = { id: string; name: string; role: DomainRole };
type Project = {
  id: number;
  name: string;
  divisions?: { id: number; name: string }[];
};

export function DomainAssignTask({
  viewerId,
  onCreated,
}: {
  viewerId?: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/domain/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) => setPeople(b.users ?? []))
      .catch(() => null);
    fetch("/api/domain/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((b) => setProjects(b.projects ?? []))
      .catch(() => null);
  }, [open]);

  const project = projects.find((p) => String(p.id) === projectId);
  const divisions = project?.divisions ?? [];

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/domain/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        assigneeId: assigneeId || undefined,
        // Omitted entirely for an ad-hoc task.
        projectId: projectId || undefined,
        divisionId: divisionId || undefined,
        targetDate: targetDate || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't create that task.");
      return;
    }
    setTitle("");
    setAssigneeId("");
    setProjectId("");
    setDivisionId("");
    setTargetDate("");
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary mb-4">
        <Plus size={16} className="mr-1.5" /> Assign a task
      </button>
    );
  }

  return (
    <div className="card p-5 mb-5">
      <h3 className="font-heading font-semibold text-ink-900 mb-3">
        Assign a task
      </h3>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        className={inputClass("md", "w-full mb-3")}
      />

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Assign to</span>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className={selectClass("md", "w-full")}
          >
            <option value="">Pick a person…</option>
            {viewerId && (
              <option value={viewerId}>Myself (work I picked up)</option>
            )}
            {people
              .filter((p) => p.id !== viewerId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {DOMAIN_ROLE_LABELS[p.role] ?? p.role}
                </option>
              ))}
          </select>
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Project</span>
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              // A division belongs to one project; keeping a stale one
              // would silently attach the task to the wrong discipline.
              setDivisionId("");
            }}
            className={selectClass("md", "w-full")}
          >
            <option value="">Ad hoc — no project</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* Only meaningful once a project with divisions is chosen. */}
        {divisions.length > 0 && (
          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">
              Division{" "}
              <span className="text-ink-400 font-normal">(optional)</span>
            </span>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className={selectClass("md", "w-full")}
            >
              <option value="">Not division-specific</option>
              {divisions.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">
            Due <span className="text-ink-400 font-normal">(optional)</span>
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className={dateClass("md", "w-full")}
          />
        </label>
      </div>

      {error && <p className="text-sm text-brand-redText mb-2">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !title.trim() || !assigneeId}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? "Assigning…" : "Assign task"}
        </button>
      </div>
    </div>
  );
}
