"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import {
  DOMAIN_ROLE_LABELS,
  TAG_COMPLEXITIES,
  TAG_HOLDER_ROLES,
  type TagComplexity,
} from "@/lib/domain";
import {
  RateField,
  ResourceChecklist,
  ResourceDetail,
  ResourceSelect,
  useAvailability,
  type Availability,
} from "@/components/DomainResourcePicker";
import { fmtDate as fmt } from "@/lib/domain-format";
import { dateClass, inputClass, selectClass } from "@/lib/domain-ui";

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
/** Everyone who can hold tags — Leads included, since an Admin may
 *  assign to one. Admins never carry delivery. */
const WORKING: string[] = TAG_HOLDER_ROLES;

function verdictCls(status: string): string {
  if (status === "On Track") return "bg-brand-greenBg text-brand-greenText";
  if (status === "Behind Schedule") return "bg-brand-redBg text-brand-redText";
  return "bg-ink-100 text-ink-500";
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
  availability,
}: {
  totalTags: string;
  divisions: DivisionDraft[];
  setDivisions: (fn: (d: DivisionDraft[]) => DivisionDraft[]) => void;
  picked: string[];
  setPicked: (fn: (p: string[]) => string[]) => void;
  workers: ForecastPerson[];
  availability: Map<string, Availability>;
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
        <ResourceChecklist
          people={workers}
          picked={picked}
          availability={availability}
          onToggle={(id, next) =>
            setPicked((prev) => (next ? [...prev, id] : prev.filter((x) => x !== id)))
          }
        />
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
  const { byId: availability } = useAvailability();

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
            className={dateClass("sm", "w-full")}
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Handover date</span>
          <input
            type="date"
            value={handoverDate}
            onChange={(e) => setHandoverDate(e.target.value)}
            className={dateClass("sm", "w-full")}
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
        availability={availability}
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
  const { byId: availability } = useAvailability();

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
            className={dateClass("sm", "w-full")}
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Handover date</span>
          <input
            type="date"
            value={handoverDate}
            onChange={(e) => setHandoverDate(e.target.value)}
            className={dateClass("sm", "w-full")}
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
        availability={availability}
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
  complexity?: string;
  startDate: string | null;
  targetDate: string | null;
};


/**
 * A project's tag position, broken out per allocated resource.
 *
 * The flat list this replaced merged everyone's assignments together, so a
 * Lead couldn't see what any one person was carrying without reading the
 * whole thing. Each resource booked on the project now gets its own
 * section — their divisions, dates and progress, their own totals, and an
 * Assign tags button that already knows who it's for.
 */
export function TagAssignmentPanel({
  project,
  people,
  canAssign,
  rows,
  onChanged,
}: {
  project: ForecastProject;
  people: ForecastPerson[];
  canAssign: boolean;
  /** Owned by the page, which also renders the project header from it. */
  rows: AssignmentRow[];
  onChanged: () => void;
}) {
  const { byId: availability, reload: reloadAvailability } =
    useAvailability(canAssign);
  /** Which person's section has its assign form open; "new" = someone not
   *  yet on the project. */
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const workers = people.filter((p) => WORKING.includes(p.role));
  const divisions = project.divisions ?? [];

  // Per-division project rollup — the whole-project view above the people.
  const divisionRollup = divisions.map((d) => {
    const forDiv = rows.filter((r) => r.divisionId === d.id);
    return {
      ...d,
      assigned: forDiv.reduce((s, r) => s + r.assignedCount, 0),
      delivered: forDiv.reduce((s, r) => s + r.deliveredCount, 0),
    };
  });

  // One section per person: everyone booked on the project, plus anyone
  // holding tags without a formal booking (otherwise their work would be
  // invisible here).
  const sections = (() => {
    const map = new Map<string, { id: string; name: string; items: AssignmentRow[] }>();
    for (const r of project.resources ?? []) {
      map.set(r.id, { id: r.id, name: r.name, items: [] });
    }
    for (const a of rows) {
      const entry = map.get(a.assigneeId) ?? {
        id: a.assigneeId,
        name: a.assigneeName,
        items: [],
      };
      entry.items.push(a);
      map.set(a.assigneeId, entry);
    }
    // Most tags outstanding first — where a Lead's attention belongs.
    return Array.from(map.values()).sort((a, b) => {
      const open = (x: typeof a) =>
        x.items.reduce((s, i) => s + (i.assignedCount - i.deliveredCount), 0);
      return open(b) - open(a) || a.name.localeCompare(b.name);
    });
  })();

  const totalAssigned = rows.reduce((s, r) => s + r.assignedCount, 0);
  const totalDelivered = rows.reduce((s, r) => s + r.deliveredCount, 0);
  const master = project.totalTags || 0;

  return (
    <section className="card p-5 mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-heading text-lg font-semibold text-ink-900">
            Tags by division
          </h3>
          <p className="text-sm text-ink-500 mt-0.5">
            How the project&apos;s tags split across disciplines, and who is
            carrying them.
          </p>
        </div>
        {canAssign && (
          <button
            onClick={() => setAssigningTo(assigningTo === "new" ? null : "new")}
            className="btn-ghost text-sm"
          >
            <Plus size={14} className="mr-1" /> Assign to someone else
          </button>
        )}
      </div>

      {divisionRollup.length > 0 && (
        <div className="mb-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Division</th>
                <th className="text-right font-semibold px-3 py-2">Total</th>
                <th className="text-right font-semibold px-3 py-2">Assigned</th>
                <th className="text-right font-semibold px-3 py-2">Delivered</th>
                <th className="text-right font-semibold px-3 py-2">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {divisionRollup.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 text-ink-900 font-medium">{d.name}</td>
                  <td className="px-3 py-2 text-right text-ink-700">
                    {d.totalTags || "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-700">{d.assigned}</td>
                  <td className="px-3 py-2 text-right text-brand-greenText font-semibold">
                    {d.delivered}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-700">
                    {Math.max(0, (d.totalTags || d.assigned) - d.delivered)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assigning to somebody not already on the project. */}
      {assigningTo === "new" && (
        <div className="mb-5 p-4 rounded-card border border-ink-200 bg-ink-50">
          <AssignForm
            projectId={project.id}
            divisions={divisions}
            workers={workers}
            availability={availability}
            onRateSaved={reloadAvailability}
            onDone={() => {
              setAssigningTo(null);
              onChanged();
            }}
            onCancel={() => setAssigningTo(null)}
          />
        </div>
      )}

      <h4 className="font-heading text-sm font-semibold text-ink-700 uppercase tracking-wide mb-2">
        Allocated resources
      </h4>

      {sections.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          Nobody is allocated to this project yet. Edit the project to book
          resources, or use &ldquo;Assign to someone else&rdquo;.
        </p>
      ) : (
        <div className="grid gap-3">
          {sections.map((sec) => {
            const a = availability.get(sec.id);
            const assigned = sec.items.reduce((s, r) => s + r.assignedCount, 0);
            const delivered = sec.items.reduce((s, r) => s + r.deliveredCount, 0);
            const pending = sec.items.reduce((s, r) => s + r.pendingCount, 0);
            const pct = assigned > 0 ? (delivered / assigned) * 100 : 0;

            return (
              <div
                key={sec.id}
                className="rounded-card border border-ink-200 overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3 px-4 py-3 bg-ink-50 border-b border-ink-200 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-semibold text-ink-900">
                        {sec.name}
                      </span>
                      {a && (
                        <span
                          className={`px-2 py-0.5 rounded-pill text-[11px] font-medium ${
                            a.status === "Free"
                              ? "bg-brand-greenBg text-brand-greenText"
                              : "bg-brand-yellowBg text-brand-yellowText"
                          }`}
                        >
                          {a.status === "Free" ? "Free" : "Busy"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      {a ? (
                        <>
                          {DOMAIN_ROLE_LABELS[a.role]}
                          {a.measuredRate !== null && (
                            <>
                              {" · "}
                              <strong className="text-ink-700">
                                {a.measuredRate}/day
                              </strong>
                            </>
                          )}
                          {a.status !== "Free" &&
                            ` · frees up ${fmt(a.availableFrom)}`}
                        </>
                      ) : (
                        "Not booked on this project"
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-heading font-semibold text-ink-900">
                        {delivered} / {assigned}
                      </div>
                      <div className="text-[11px] text-ink-500">
                        delivered
                        {pending > 0 && (
                          <span className="text-brand-yellowText">
                            {" "}
                            · {pending} pending
                          </span>
                        )}
                      </div>
                    </div>
                    {canAssign && (
                      <button
                        onClick={() =>
                          setAssigningTo(assigningTo === sec.id ? null : sec.id)
                        }
                        className="btn-primary text-sm"
                      >
                        <Plus size={14} className="mr-1" /> Assign tags
                      </button>
                    )}
                  </div>
                </div>

                {assigned > 0 && (
                  <div className="h-1 bg-ink-100">
                    <div
                      className="h-full bg-brand-green"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                {assigningTo === sec.id && (
                  <div className="px-4 py-3 border-b border-ink-100 bg-white">
                    <AssignForm
                      projectId={project.id}
                      divisions={divisions}
                      workers={workers}
                      availability={availability}
                      lockedAssignee={{ id: sec.id, name: sec.name }}
                      onRateSaved={reloadAvailability}
                      onDone={() => {
                        setAssigningTo(null);
                        onChanged();
                      }}
                      onCancel={() => setAssigningTo(null)}
                    />
                  </div>
                )}

                {sec.items.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-ink-400 italic">
                    No tags assigned to {sec.name} yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {sec.items.map((r) =>
                      editing === r.id ? (
                        <EditAssignmentRow
                          key={r.id}
                          row={r}
                          divisions={divisions}
                          workers={workers}
                          onCancel={() => setEditing(null)}
                          onSaved={() => {
                            setEditing(null);
                            onChanged();
                          }}
                        />
                      ) : (
                        <li
                          key={r.id}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <span className="text-ink-900 font-medium">
                              {r.divisionName ?? "No division"}
                            </span>
                            {/* Only worth saying when it isn't the default —
                                labelling every ordinary batch "Simple" is
                                noise. */}
                            {r.complexity === "Complex" && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded-pill text-[11px] font-medium bg-brand-yellowBg text-brand-yellowText">
                                Complex
                              </span>
                            )}
                            {(r.startDate || r.targetDate) && (
                              <span className="text-ink-500">
                                {" "}
                                · {fmt(r.startDate)} → {fmt(r.targetDate)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-ink-700">
                              <strong className="text-brand-greenText">
                                {r.deliveredCount}
                              </strong>{" "}
                              / {r.assignedCount}
                              {r.pendingCount > 0 && (
                                <span className="text-brand-yellowText">
                                  {" "}
                                  (+{r.pendingCount})
                                </span>
                              )}
                            </span>
                            {canAssign && (
                              <button
                                onClick={() => setEditing(r.id)}
                                className="btn-ghost text-xs"
                                aria-label={`Edit ${sec.name}'s ${r.divisionName ?? ""} assignment`}
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The assign-tags form. When opened from a person's section the assignee
 * is fixed and shown as a name; the general entry point keeps the picker
 * so a Lead can bring somebody new onto the project.
 */
function AssignForm({
  projectId,
  divisions,
  workers,
  availability,
  lockedAssignee,
  onDone,
  onCancel,
  onRateSaved,
}: {
  projectId: number;
  divisions: { id: number; name: string }[];
  workers: ForecastPerson[];
  availability: Map<string, Availability>;
  lockedAssignee?: { id: string; name: string };
  onDone: () => void;
  onCancel: () => void;
  onRateSaved: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(lockedAssignee?.id ?? "");
  const [divisionId, setDivisionId] = useState("");
  const [count, setCount] = useState("");
  /** Simple unless a Lead says otherwise — an unanswered dropdown and an
   *  explicit "Simple" mean the same thing. */
  const [complexity, setComplexity] = useState<TagComplexity>("Simple");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/domain/tag-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        assigneeId,
        divisionId: divisionId || undefined,
        assignedCount: Number(count),
        complexity,
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
    onDone();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-5 pb-4">
        {lockedAssignee ? (
          <div className="text-sm">
            <span className="block text-ink-700 mb-1">Assigning to</span>
            <span className="inline-block px-2.5 py-1.5 rounded bg-brand-blueBg text-brand-blue font-medium">
              {lockedAssignee.name}
            </span>
          </div>
        ) : (
          <ResourceSelect
            label="Person"
            people={workers}
            value={assigneeId}
            onChange={setAssigneeId}
            availability={availability}
          />
        )}

        {assigneeId && (
          <RateField
            userId={assigneeId}
            availability={availability}
            onSaved={onRateSaved}
          />
        )}

        {divisions.length > 0 && (
          <label className="text-sm block">
            <span className="block text-ink-700 font-medium mb-1">Division</span>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className={selectClass("md")}
            >
              <option value="">Pick a division…</option>
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
            className={inputClass("sm", "w-24")}
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Complexity</span>
          <select
            value={complexity}
            onChange={(e) => setComplexity(e.target.value as TagComplexity)}
            className={selectClass("sm")}
          >
            {TAG_COMPLEXITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Start</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={dateClass("sm")}
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Target</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className={dateClass("sm")}
          />
        </label>
        <button
          onClick={submit}
          disabled={busy || !assigneeId || !count}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? "Assigning…" : "Assign"}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>

      {!lockedAssignee && <ResourceDetail a={availability.get(assigneeId)} />}
      {error && <p className="text-xs text-brand-redText mt-2">{error}</p>}
    </div>
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
  const { byId: availability } = useAvailability();

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
        <ResourceSelect
          label="Person"
          people={workers}
          value={assigneeId}
          onChange={setAssigneeId}
          availability={availability}
        />
        {divisions.length > 0 && (
          <label className="text-sm block">
            <span className="block text-ink-700 font-medium mb-1">Division</span>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className={selectClass("md")}
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
            className={dateClass("sm")}
          />
        </label>
        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Target</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className={dateClass("sm")}
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
      <ResourceDetail a={availability.get(assigneeId)} />
      {error && <p className="text-xs text-brand-redText mt-1.5">{error}</p>}
    </li>
  );
}
