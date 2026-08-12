"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

/**
 * The forecast-facing pieces of the Domain projects page: creating a
 * project with its divisions, resources and dates; and assigning tags
 * division-wise once it exists. Kept out of the page file, which is long
 * enough already.
 */

export type ForecastPerson = { id: string; name: string; role: string };

export type ForecastProject = {
  id: number;
  name: string;
  handoverDate?: string | null;
  totalTags?: number;
  divisions?: { id: number; name: string; totalTags: number }[];
};

/** Roles that can hold tags and be booked onto a project. */
const WORKING = ["Actionee", "SME", "TeamLead"];

function verdictCls(status: string): string {
  if (status === "On Track") return "bg-brand-greenBg text-brand-greenText";
  if (status === "Behind Schedule") return "bg-brand-redBg text-brand-redText";
  return "bg-ink-100 text-ink-500";
}

type CreateResult = {
  forecast: { status: string; projectedDate: string | null; reason: string } | null;
  conflicts: {
    resourceName: string;
    conflicts: {
      projectName: string;
      startDate: string;
      endDate: string;
      availableFrom: string;
    }[];
  }[];
  allocationsSkipped: string | null;
};

/**
 * Create a project and set up its forecast in one pass. The response
 * carries the schedule verdict, so the Lead sees On Track / Behind Schedule
 * — and any resource clash — before they leave the form.
 */
export function CreateProjectForm({
  people,
  onCancel,
  onCreated,
}: {
  people: ForecastPerson[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [totalTags, setTotalTags] = useState("");
  const [startDate, setStartDate] = useState("");
  const [handoverDate, setHandoverDate] = useState("");
  const [divisions, setDivisions] = useState<{ name: string; totalTags: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  const workers = people.filter((p) => WORKING.includes(p.role));

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/domain/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: desc,
        totalTags: totalTags ? Number(totalTags) : 0,
        startDate: startDate || null,
        handoverDate: handoverDate || null,
        divisions: divisions
          .filter((d) => d.name.trim())
          .map((d) => ({ name: d.name.trim(), totalTags: Number(d.totalTags) || 0 })),
        resourceIds: picked,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't create project.");
      return;
    }
    onCreated();
    // Hold the panel open on anything the Lead should read before moving on.
    if (body.forecast || body.conflicts?.length || body.allocationsSkipped) {
      setResult({
        forecast: body.forecast ?? null,
        conflicts: body.conflicts ?? [],
        allocationsSkipped: body.allocationsSkipped ?? null,
      });
    }
  }

  if (result) {
    return (
      <div className="card p-4 mb-6">
        <h3 className="font-heading font-semibold mb-2">Project created</h3>
        {result.forecast && (
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`px-2 py-0.5 rounded-pill text-xs font-medium ${verdictCls(result.forecast.status)}`}
            >
              {result.forecast.status}
            </span>
            <span className="text-sm text-ink-700">{result.forecast.reason}</span>
          </div>
        )}
        {result.allocationsSkipped && (
          <p className="text-sm text-brand-yellowText mt-1">
            {result.allocationsSkipped}
          </p>
        )}
        {result.conflicts.length > 0 && (
          <div className="mt-2 p-3 rounded bg-brand-yellowBg border border-brand-yellowBorder">
            <p className="text-sm font-medium text-brand-yellowText">
              Some resources were already allocated elsewhere
            </p>
            <ul className="mt-1 space-y-0.5">
              {result.conflicts.map((c) => (
                <li key={c.resourceName} className="text-xs text-ink-700">
                  <span className="font-medium">{c.resourceName}</span> —{" "}
                  {c.conflicts
                    .map(
                      (x) =>
                        `${x.projectName} (${x.startDate} to ${x.endDate}, free ${x.availableFrom})`,
                    )
                    .join("; ")}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button onClick={onCancel} className="btn-primary mt-3">
          Done
        </button>
      </div>
    );
  }

  return (
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
        className="w-full px-3 py-2 mb-3 rounded border border-ink-200 text-sm"
      />

      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Total tags</span>
          <input
            type="number"
            min={0}
            value={totalTags}
            onChange={(e) => setTotalTags(e.target.value)}
            placeholder="160"
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Handover date</span>
          <input
            type="date"
            value={handoverDate}
            onChange={(e) => setHandoverDate(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-ink-700">Divisions (optional)</span>
          <button
            onClick={() => setDivisions((d) => [...d, { name: "", totalTags: "" }])}
            className="btn-ghost text-xs"
          >
            <Plus size={12} className="mr-1" /> Add division
          </button>
        </div>
        {divisions.length === 0 ? (
          <p className="text-xs text-ink-400 italic">
            Leave empty if this project isn&apos;t split by discipline.
          </p>
        ) : (
          <div className="space-y-2">
            {divisions.map((d, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={d.name}
                  onChange={(e) =>
                    setDivisions((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  placeholder="Electrical"
                  className="flex-1 px-2 py-1.5 rounded border border-ink-200 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  value={d.totalTags}
                  onChange={(e) =>
                    setDivisions((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, totalTags: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Tags"
                  className="w-24 px-2 py-1.5 rounded border border-ink-200 text-sm"
                />
                <button
                  onClick={() => setDivisions((prev) => prev.filter((_, j) => j !== i))}
                  className="btn-ghost text-xs"
                  aria-label="Remove division"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3">
        <span className="block text-sm text-ink-700 mb-1">Allocate resources</span>
        {workers.length === 0 ? (
          <p className="text-xs text-ink-400 italic">No allocatable people yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {workers.map((p) => {
              const on = picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    setPicked((prev) =>
                      on ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                    )
                  }
                  className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
                    on
                      ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                      : "bg-white text-ink-600 border-ink-200"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-ink-400 mt-1">
          Bookings run from the start date to handover. Clashes are reported,
          not blocked.
        </p>
      </div>

      {error && <p className="text-xs text-brand-redText mb-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!name.trim() || busy}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

type AssignmentRow = {
  id: number;
  assigneeName: string;
  divisionName: string | null;
  assignedCount: number;
  deliveredCount: number;
  pendingCount: number;
};

/** Division-wise tag assignment for one project, plus the delivered rollup. */
export function TagAssignmentPanel({
  project,
  people,
  canAssign,
  onChanged,
}: {
  project: ForecastProject;
  people: ForecastPerson[];
  canAssign: boolean;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/domain/tag-assignments?projectId=${project.id}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { assignments: [] }))
      .then((b) => setRows(b.assignments ?? []))
      .catch(() => setRows([]));
  }, [project.id]);

  useEffect(load, [load]);

  const workers = people.filter((p) => WORKING.includes(p.role));
  const divisions = project.divisions ?? [];

  async function assign() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/domain/tag-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        assigneeId,
        divisionId: divisionId || undefined,
        assignedCount: Number(count),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't assign tags.");
      return;
    }
    setCount("");
    setOpen(false);
    load();
    onChanged();
  }

  const totalAssigned = rows.reduce((s, r) => s + r.assignedCount, 0);
  const totalDelivered = rows.reduce((s, r) => s + r.deliveredCount, 0);

  return (
    <section className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-heading font-semibold text-ink-900">Tags</h3>
          <p className="text-xs text-ink-500">
            {totalDelivered} / {totalAssigned || project.totalTags || 0} delivered
            {project.handoverDate ? ` · handover ${project.handoverDate}` : ""}
          </p>
        </div>
        {canAssign && (
          <button onClick={() => setOpen((v) => !v)} className="btn-ghost text-sm">
            <Plus size={14} className="mr-1" /> Assign tags
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-2 mb-3 pb-3 border-b border-ink-100">
          <label className="text-sm">
            <span className="block text-ink-700 mb-1">Person</span>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="px-2 py-1.5 rounded border border-ink-200 text-sm"
            >
              <option value="">Pick…</option>
              {workers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {divisions.length > 0 && (
            <label className="text-sm">
              <span className="block text-ink-700 mb-1">Division</span>
              <select
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                className="px-2 py-1.5 rounded border border-ink-200 text-sm"
              >
                <option value="">Pick…</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="block text-ink-700 mb-1">Tags</span>
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder="100"
              className="w-24 px-2 py-1.5 rounded border border-ink-200"
            />
          </label>
          <button
            onClick={assign}
            disabled={busy || !assigneeId || !count}
            className="btn-primary disabled:opacity-50"
          >
            {busy ? "Assigning…" : "Assign"}
          </button>
          {error && <p className="text-xs text-brand-redText w-full">{error}</p>}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-ink-400 italic">No tags assigned yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-900">
                {r.assigneeName}
                {r.divisionName && (
                  <span className="text-ink-500"> · {r.divisionName}</span>
                )}
              </span>
              <span className="text-ink-700">
                {r.deliveredCount} / {r.assignedCount}
                {r.pendingCount > 0 && (
                  <span className="text-brand-yellowText">
                    {" "}
                    (+{r.pendingCount} pending)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
