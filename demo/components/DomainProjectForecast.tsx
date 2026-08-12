"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, AlertTriangle, X } from "lucide-react";

/**
 * The forecast-facing pieces of the Domain projects page: creating and
 * editing a project (its master tag count, dates, divisions and
 * resources), and assigning tags division-wise once it exists.
 */

export type ForecastPerson = { id: string; name: string; role: string };

export type ForecastProject = {
  id: number;
  name: string;
  description?: string | null;
  handoverDate?: string | null;
  startDate?: string | null;
  totalTags?: number;
  client?: string | null;
  divisions?: { id: number; name: string; totalTags: number }[];
  resources?: { id: string; name: string }[];
};

/** Roles that can hold tags and be booked onto a project. */
const WORKING = ["Actionee", "SME", "TeamLead"];

function verdictCls(status: string): string {
  if (status === "On Track") return "bg-brand-greenBg text-brand-greenText";
  if (status === "Behind Schedule") return "bg-brand-redBg text-brand-redText";
  return "bg-ink-100 text-ink-500";
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

type DivisionDraft = { divisionId?: number; name: string; totalTags: string };

/** Divisions + resources editor, shared by the create and edit forms. */
function ScopeFields({
  totalTags,
  divisions,
  setDivisions,
  picked,
  setPicked,
  workers,
}: {
  totalTags: string;
  divisions: DivisionDraft[];
  setDivisions: (fn: (d: DivisionDraft[]) => DivisionDraft[]) => void;
  picked: string[];
  setPicked: (fn: (p: string[]) => string[]) => void;
  workers: ForecastPerson[];
}) {
  const divisionSum = divisions.reduce((s, d) => s + (Number(d.totalTags) || 0), 0);
  const total = Number(totalTags) || 0;
  // Mirrors the server rule, so the Lead sees the problem before saving.
  const over = total > 0 && divisionSum > total;

  return (
    <>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-ink-700">Divisions</span>
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
            <p className={`text-xs ${over ? "text-brand-redText" : "text-ink-500"}`}>
              Divisions total {divisionSum}
              {total > 0 && ` of the project's ${total}`}
              {over && " — that's more than the project has."}
            </p>
          </div>
        )}
      </div>

      <div className="mb-3">
        <span className="block text-sm text-ink-700 mb-1">Resources</span>
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
    </>
  );
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

/** Create a project and set up its forecast in one pass. */
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
  const [client, setClient] = useState("");
  const [totalTags, setTotalTags] = useState("");
  const [startDate, setStartDate] = useState("");
  const [handoverDate, setHandoverDate] = useState("");
  const [divisions, setDivisions] = useState<DivisionDraft[]>([]);
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
        client: client || null,
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
          <p className="text-sm text-brand-yellowText mt-1">{result.allocationsSkipped}</p>
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
                        `${x.projectName} (${fmt(x.startDate)} to ${fmt(x.endDate)}, free ${fmt(x.availableFrom)})`,
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

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Client</span>
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Thermax"
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Master tag count</span>
          <input
            type="number"
            min={0}
            value={totalTags}
            onChange={(e) => setTotalTags(e.target.value)}
            placeholder="6000"
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

      <ScopeFields
        totalTags={totalTags}
        divisions={divisions}
        setDivisions={setDivisions}
        picked={picked}
        setPicked={setPicked}
        workers={workers}
      />

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

/** Edit an existing project's scope: client, master tag count, dates,
 *  divisions and resources. */
export function EditProjectForm({
  project,
  people,
  onCancel,
  onSaved,
}: {
  project: ForecastProject;
  people: ForecastPerson[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [desc, setDesc] = useState(project.description ?? "");
  const [client, setClient] = useState(project.client ?? "");
  const [totalTags, setTotalTags] = useState(String(project.totalTags ?? ""));
  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [handoverDate, setHandoverDate] = useState(project.handoverDate ?? "");
  const [divisions, setDivisions] = useState<DivisionDraft[]>(
    (project.divisions ?? []).map((d) => ({
      divisionId: d.id,
      name: d.name,
      totalTags: String(d.totalTags || ""),
    })),
  );
  const [picked, setPicked] = useState<string[]>(
    (project.resources ?? []).map((r) => r.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workers = people.filter((p) => WORKING.includes(p.role));

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/domain/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: desc || null,
        client: client || null,
        totalTags: Number(totalTags) || 0,
        startDate: startDate || null,
        handoverDate: handoverDate || null,
        divisions: divisions
          .filter((d) => d.name.trim())
          .map((d) => ({
            divisionId: d.divisionId,
            name: d.name.trim(),
            totalTags: Number(d.totalTags) || 0,
          })),
        resourceIds: picked,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't save those changes.");
      return;
    }
    onSaved();
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-semibold">Edit project</h3>
        <button onClick={onCancel} className="btn-ghost text-sm" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <input
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

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Client</span>
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Master tag count</span>
          <input
            type="number"
            min={0}
            value={totalTags}
            onChange={(e) => setTotalTags(e.target.value)}
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

      <ScopeFields
        totalTags={totalTags}
        divisions={divisions}
        setDivisions={setDivisions}
        picked={picked}
        setPicked={setPicked}
        workers={workers}
      />

      {error && <p className="text-xs text-brand-redText mb-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button onClick={save} disabled={busy} className="btn-primary disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

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

type AvailabilityRow = {
  id: string;
  name: string;
  status: string;
  availableFrom: string | null;
  projects: {
    projectName: string;
    startDate: string;
    endDate: string;
    openTags: number;
  }[];
};

/** Division-wise tag assignment for one project, with per-division
 *  totals, dates, edit/remove, and a read on whether the person is busy. */
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
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [count, setCount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch(`/api/domain/tag-assignments?projectId=${project.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { assignments: [] }))
      .then((b) => setRows(b.assignments ?? []))
      .catch(() => setRows([]));
  }, [project.id]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!canAssign) return;
    fetch("/api/domain/resources/availability", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { resources: [] }))
      .then((b) => setAvailability(b.resources ?? []))
      .catch(() => setAvailability([]));
  }, [canAssign, rows.length]);

  const workers = people.filter((p) => WORKING.includes(p.role));
  const divisions = project.divisions ?? [];
  const picked = availability.find((a) => a.id === assigneeId);

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
        startDate: startDate || null,
        targetDate: targetDate || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't assign tags.");
      return;
    }
    setCount("");
    setStartDate("");
    setTargetDate("");
    setOpen(false);
    load();
    onChanged();
  }

  // Per-division rollup: what the division holds, what's been handed out
  // and what's actually delivered.
  const divisionRollup = divisions.map((d) => {
    const forDiv = rows.filter((r) => r.divisionId === d.id);
    return {
      ...d,
      assigned: forDiv.reduce((s, r) => s + r.assignedCount, 0),
      delivered: forDiv.reduce((s, r) => s + r.deliveredCount, 0),
    };
  });

  const totalAssigned = rows.reduce((s, r) => s + r.assignedCount, 0);
  const totalDelivered = rows.reduce((s, r) => s + r.deliveredCount, 0);
  const master = project.totalTags || 0;

  return (
    <section className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="font-heading font-semibold text-ink-900">Tags</h3>
          <p className="text-xs text-ink-500">
            {totalDelivered} delivered · {totalAssigned} assigned
            {master > 0 && ` · ${master} in the project`}
            {master > 0 && totalAssigned < master && (
              <span className="text-brand-yellowText">
                {" "}
                · {master - totalAssigned} not yet assigned
              </span>
            )}
          </p>
        </div>
        {canAssign && (
          <button onClick={() => setOpen((v) => !v)} className="btn-ghost text-sm">
            <Plus size={14} className="mr-1" /> Assign tags
          </button>
        )}
      </div>

      {divisionRollup.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-3 py-1.5">Division</th>
                <th className="text-left font-semibold px-3 py-1.5">Tags</th>
                <th className="text-left font-semibold px-3 py-1.5">Assigned</th>
                <th className="text-left font-semibold px-3 py-1.5">Delivered</th>
                <th className="text-left font-semibold px-3 py-1.5">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {divisionRollup.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-1.5 text-ink-900">{d.name}</td>
                  <td className="px-3 py-1.5 text-ink-700">{d.totalTags || "—"}</td>
                  <td className="px-3 py-1.5 text-ink-700">{d.assigned}</td>
                  <td className="px-3 py-1.5 text-ink-900 font-medium">{d.delivered}</td>
                  <td className="px-3 py-1.5 text-ink-700">
                    {Math.max(0, (d.totalTags || d.assigned) - d.delivered)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="mb-3 pb-3 border-b border-ink-100">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block text-ink-700 mb-1">Person</span>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="px-2 py-1.5 rounded border border-ink-200 text-sm"
              >
                <option value="">Pick…</option>
                {workers.map((p) => {
                  const a = availability.find((x) => x.id === p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {a && a.status === "Allocated" ? " (busy)" : " (free)"}
                    </option>
                  );
                })}
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
            <label className="text-sm">
              <span className="block text-ink-700 mb-1">Start</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1.5 rounded border border-ink-200"
              />
            </label>
            <label className="text-sm">
              <span className="block text-ink-700 mb-1">Target</span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="px-2 py-1.5 rounded border border-ink-200"
              />
            </label>
            <button
              onClick={assign}
              disabled={busy || !assigneeId || !count}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? "Assigning…" : "Assign"}
            </button>
          </div>

          {/* What this person already has on, so the Lead isn't assigning blind. */}
          {picked && (
            <div
              className={`mt-2 p-2.5 rounded text-xs ${
                picked.status === "Allocated"
                  ? "bg-brand-yellowBg border border-brand-yellowBorder"
                  : "bg-brand-greenBg"
              }`}
            >
              {picked.status === "Allocated" ? (
                <>
                  <div className="flex items-center gap-1.5 font-medium text-brand-yellowText">
                    <AlertTriangle size={12} /> {picked.name} is already working on:
                  </div>
                  <ul className="mt-1 space-y-0.5 text-ink-700">
                    {picked.projects.map((p) => (
                      <li key={p.projectName}>
                        {p.projectName} · {fmt(p.startDate)} → {fmt(p.endDate)}
                        {p.openTags > 0 && ` · ${p.openTags} tags still open`}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-ink-700">
                    Frees up {picked.availableFrom ? fmt(picked.availableFrom) : "now"}.
                  </div>
                </>
              ) : (
                <span className="text-brand-greenText">
                  {picked.name} has nothing booked — free now.
                </span>
              )}
            </div>
          )}
          {error && <p className="text-xs text-brand-redText mt-2">{error}</p>}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-ink-400 italic">No tags assigned yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) =>
            editing === r.id ? (
              <EditAssignmentRow
                key={r.id}
                row={r}
                divisions={divisions}
                workers={workers}
                onCancel={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  load();
                  onChanged();
                }}
              />
            ) : (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="text-ink-900">{r.assigneeName}</span>
                  {r.divisionName && (
                    <span className="text-ink-500"> · {r.divisionName}</span>
                  )}
                  {(r.startDate || r.targetDate) && (
                    <span className="text-ink-500">
                      {" "}
                      · {fmt(r.startDate)} → {fmt(r.targetDate)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-ink-700">
                    {r.deliveredCount} / {r.assignedCount}
                    {r.pendingCount > 0 && (
                      <span className="text-brand-yellowText"> (+{r.pendingCount})</span>
                    )}
                  </span>
                  {canAssign && (
                    <button
                      onClick={() => setEditing(r.id)}
                      className="btn-ghost text-xs"
                      aria-label={`Edit ${r.assigneeName}'s assignment`}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** Inline editor for one assignment: person, division, dates, count. */
function EditAssignmentRow({
  row,
  divisions,
  workers,
  onCancel,
  onSaved,
}: {
  row: AssignmentRow;
  divisions: { id: number; name: string }[];
  workers: ForecastPerson[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(row.assigneeId);
  const [divisionId, setDivisionId] = useState(
    row.divisionId ? String(row.divisionId) : "",
  );
  const [count, setCount] = useState(String(row.assignedCount));
  const [startDate, setStartDate] = useState(row.startDate ?? "");
  const [targetDate, setTargetDate] = useState(row.targetDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/domain/tag-assignments/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assigneeId,
        divisionId: divisionId || null,
        assignedCount: Number(count),
        startDate: startDate || null,
        targetDate: targetDate || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't save that.");
      return;
    }
    onSaved();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/domain/tag-assignments/${row.id}`, {
      method: "DELETE",
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't remove that.");
      return;
    }
    onSaved();
  }

  return (
    <li className="p-2.5 rounded bg-ink-50 border border-ink-200">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Person</span>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="px-2 py-1 rounded border border-ink-200 text-sm"
          >
            {workers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {divisions.length > 0 && (
          <label className="text-xs">
            <span className="block text-ink-700 mb-1">Division</span>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="px-2 py-1 rounded border border-ink-200 text-sm"
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Tags</span>
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-20 px-2 py-1 rounded border border-ink-200 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Start</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 rounded border border-ink-200 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Target</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="px-2 py-1 rounded border border-ink-200 text-sm"
          />
        </label>
        <button onClick={save} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
          Save
        </button>
        <button onClick={onCancel} className="btn-ghost text-sm">
          Cancel
        </button>
        <button
          onClick={remove}
          disabled={busy || row.deliveredCount > 0}
          title={
            row.deliveredCount > 0
              ? "Tags have already been delivered here — reduce the count instead."
              : "Remove this assignment"
          }
          className="btn-ghost text-sm text-brand-redText disabled:opacity-40"
        >
          <Trash2 size={13} />
        </button>
      </div>
      {error && <p className="text-xs text-brand-redText mt-1.5">{error}</p>}
    </li>
  );
}
