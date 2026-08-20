"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2, Pencil, X } from "lucide-react";
import { DomainRemoveResource } from "@/components/DomainRemoveResource";
import {
  DOMAIN_ROLE_LABELS,
  TAG_COMPLEXITIES,
  TAG_HOLDER_ROLES,
  type TagComplexity,
} from "@/lib/domain";
import {
  ResourceChecklist,
  ResourceDetail,
  ResourceSelect,
  useAvailability,
  type Availability,
} from "@/components/DomainResourcePicker";
import { fmtDate as fmt } from "@/lib/domain-format";
import { useDomain } from "@/lib/domain-store";
import { dateClass, inputClass, selectClass } from "@/lib/domain-ui";
import { projectScope, SCOPE_LABELS } from "@/lib/domain-scope";
import {
  DomainHandoverFields,
  emptyHandover,
  handoverPayload,
  handoverFromProject,
  type HandoverValue,
} from "@/components/DomainHandoverFields";
import { DateInput } from "@/components/DateInput";
import { SearchSelect } from "@/components/SearchSelect";

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
  contractTags?: number | null;
  deliveredTags?: number;
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
  if (status === "Yet to be started") return "bg-brand-blueBg text-brand-blue";
  if (status === "Behind Schedule") return "bg-brand-redBg text-brand-redText";
  return "bg-ink-100 text-ink-500";
}


type DivisionDraft = { divisionId?: number; name: string; totalTags: string };

/** Divisions + resources editor, shared by the create and edit forms. */
function ScopeFields({
  contractTags,
  deliveredTags = 0,
  totalTags,
  divisions,
  setDivisions,
  picked,
  setPicked,
  workers,
  availability,
}: {
  contractTags: string;
  /** Already delivered, so the breakdown shows the whole position. Zero
   *  for a project that does not exist yet. */
  deliveredTags?: number;
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

  // The whole tag position, worked out from the two figures typed above.
  const scope = projectScope({
    contractTags: contractTags === "" ? null : Number(contractTags),
    totalTags: total,
    deliveredTags,
  });

  return (
    <>
      {/* What the numbers above add up to. Shown live so nobody has to
          do the subtraction themselves, or wonder whether the system
          agrees with them. */}
      {(scope.contractTags !== null || total > 0) && (
        <div className="rounded border border-ink-200 bg-ink-50 px-3 py-2.5 mb-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {scope.contractTags !== null && (
              <span className="text-ink-500">
                {SCOPE_LABELS.contract}{" "}
                <strong className="text-ink-900 tabular-nums">
                  {scope.contractTags}
                </strong>
              </span>
            )}
            <span className="text-ink-500">
              {SCOPE_LABELS.received}{" "}
              <strong className="text-ink-900 tabular-nums">
                {scope.receivedTags}
              </strong>
            </span>
            {scope.withClientTags !== null && (
              <span className="text-brand-yellowText">
                {SCOPE_LABELS.withClient}{" "}
                <strong className="tabular-nums">{scope.withClientTags}</strong>
              </span>
            )}
            {deliveredTags > 0 && (
              <span className="text-brand-greenText">
                {SCOPE_LABELS.delivered}{" "}
                <strong className="tabular-nums">{scope.deliveredTags}</strong>
              </span>
            )}
          </div>
          {scope.receivedExceedsContract && (
            <p className="text-[11px] text-brand-yellowText mt-1.5">
              More has been received than the contract covers — the contract
              figure is probably out of date.
            </p>
          )}
        </div>
      )}
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
  const [contractTags, setContractTags] = useState("");
  const [totalTags, setTotalTags] = useState("");
  const [schedule, setSchedule] = useState<HandoverValue>(emptyHandover());
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
        contractTags: contractTags === "" ? null : Number(contractTags),
        ...handoverPayload(schedule),
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
          {/* The whole commitment. Optional — blank on a project where the
              contract isn't tracked separately. */}
          <span className="block text-ink-700 mb-1">
            {SCOPE_LABELS.contract}{" "}
            <span className="text-ink-400 font-normal">(optional)</span>
          </span>
          <input
            type="number"
            min={0}
            value={contractTags}
            onChange={(e) => setContractTags(e.target.value)}
            placeholder="13508"
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <label className="text-sm">
          {/* What we can actually work on, and the denominator for
              delivery — hence the rename from "master tag count". */}
          <span className="block text-ink-700 mb-1">{SCOPE_LABELS.received}</span>
          <input
            type="number"
            min={0}
            value={totalTags}
            onChange={(e) => setTotalTags(e.target.value)}
            placeholder="10828"
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
      </div>

      {/* Start date, working week and total working days, which together
          give the handover date. Shared with the edit form and the
          simulator so all three produce the same date. */}
      <div className="mb-4">
        <DomainHandoverFields value={schedule} onChange={setSchedule} />
      </div>

      <ScopeFields
        contractTags={contractTags}
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
  const [contractTags, setContractTags] = useState(
    project.contractTags == null ? "" : String(project.contractTags),
  );
  const [totalTags, setTotalTags] = useState(String(project.totalTags ?? ""));
  const [schedule, setSchedule] = useState<HandoverValue>(handoverFromProject(project));
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
        contractTags: contractTags === "" ? null : Number(contractTags),
        ...handoverPayload(schedule),
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
          {/* The whole commitment. Optional — blank on a project where the
              contract isn't tracked separately. */}
          <span className="block text-ink-700 mb-1">
            {SCOPE_LABELS.contract}{" "}
            <span className="text-ink-400 font-normal">(optional)</span>
          </span>
          <input
            type="number"
            min={0}
            value={contractTags}
            onChange={(e) => setContractTags(e.target.value)}
            placeholder="13508"
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <label className="text-sm">
          {/* What we can actually work on, and the denominator for
              delivery — hence the rename from "master tag count". */}
          <span className="block text-ink-700 mb-1">{SCOPE_LABELS.received}</span>
          <input
            type="number"
            min={0}
            value={totalTags}
            onChange={(e) => setTotalTags(e.target.value)}
            placeholder="10828"
            className="w-full px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
      </div>

      {/* Start date, working week and total working days, which together
          give the handover date. Shared with the edit form and the
          simulator so all three produce the same date. */}
      <div className="mb-4">
        <DomainHandoverFields value={schedule} onChange={setSchedule} />
      </div>

      <ScopeFields
        contractTags={contractTags}
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
  /** Manual corrections an Admin has made to the delivered figure,
   *  newest first. Empty for the overwhelming majority of rows. */
  corrections?: {
    id: number;
    before: number;
    after: number;
    reason: string;
    by: string;
    at: string;
  }[];
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
  const { current } = useDomain();
  const { byId: availability, reload: reloadAvailability } =
    useAvailability(canAssign);
  /** Which person's section has its assign form open; "new" = someone not
   *  yet on the project. */
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  /**
   * The per-person breakdown is folded away by default.
   *
   * On a project with a dozen people it ran for several screens, and the
   * division rollup above it — the thing most visits are actually for —
   * was pushed off the top. Open it when you want it.
   */
  const [showPeople, setShowPeople] = useState(false);
  const [removeNotice, setRemoveNotice] = useState<string | null>(null);
  /** Who is being taken off, while the dialog is up. */
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(
    null,
  );

  const workers = people.filter((p) => WORKING.includes(p.role));
  const divisions = project.divisions ?? [];
  /** Correcting a delivered figure by hand is an Admin's job alone — a
   *  Lead who approves their own team's submissions must not also be able
   *  to type the total afterwards. Enforced at the route regardless. */
  const isAdmin = current?.role === "Admin";

  /**
   * One section per person, in two groups.
   *
   * "Allocated resources" means the people actually booked on this
   * project. It used to mean "booked, or holding a tag" — so taking
   * somebody's booking away left them sitting in the allocated list, and
   * the panel contradicted the allocation table three inches above it.
   *
   * Their tags do not vanish with the booking, though, and dropping them
   * from the screen would leave work assigned to nobody visible. So they
   * move to a second group instead, named for what they actually are.
   */
  type Section = {
    id: string;
    name: string;
    booked: boolean;
    items: AssignmentRow[];
  };
  const sections = (() => {
    const map = new Map<string, Section>();
    for (const r of project.resources ?? []) {
      map.set(r.id, { id: r.id, name: r.name, booked: true, items: [] });
    }
    for (const a of rows) {
      const entry = map.get(a.assigneeId) ?? {
        id: a.assigneeId,
        name: a.assigneeName,
        booked: false,
        items: [],
      };
      entry.items.push(a);
      map.set(a.assigneeId, entry);
    }
    // Most tags outstanding first — where a Lead's attention belongs.
    const open = (x: Section) =>
      x.items.reduce((s, i) => s + (i.assignedCount - i.deliveredCount), 0);
    const byWork = (a: Section, b: Section) =>
      open(b) - open(a) || a.name.localeCompare(b.name);
    const all = Array.from(map.values());
    return {
      booked: all.filter((x) => x.booked).sort(byWork),
      unbooked: all.filter((x) => !x.booked).sort(byWork),
    };
  })();

  /** Both groups in render order, so one loop draws them. */
  const ordered: Section[] = [...sections.booked, ...sections.unbooked];

  const totalAssigned = rows.reduce((s, r) => s + r.assignedCount, 0);
  const totalDelivered = rows.reduce((s, r) => s + r.deliveredCount, 0);
  const master = project.totalTags || 0;

  return (
    <section className="card p-5 mb-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setShowPeople((v) => !v)}
          aria-expanded={showPeople}
          className="flex items-center gap-2 text-left min-w-0"
        >
          <ChevronDown
            size={18}
            className={`shrink-0 text-ink-400 transition-transform ${showPeople ? "rotate-180" : ""}`}
          />
          <span className="min-w-0">
            <span className="block font-heading text-lg font-semibold text-ink-900">
              Assign Tags
            </span>
            <span className="block text-sm text-ink-500">
              {ordered.length === 0
                ? "Nobody is carrying tags on this project yet."
                : `${ordered.length} ${ordered.length === 1 ? "person" : "people"} · ${totalDelivered} of ${totalAssigned} delivered${
                    sections.unbooked.length > 0
                      ? ` · ${sections.unbooked.length} not booked`
                      : ""
                  }`}
            </span>
          </span>
        </button>
        {canAssign && (
          <button
            onClick={() => {
              setShowPeople(true);
              setAssigningTo(assigningTo === "new" ? null : "new");
            }}
            className="btn-ghost text-sm shrink-0"
          >
            <Plus size={14} className="mr-1" /> Assign to someone else
          </button>
        )}
      </div>

      {/* Assigning to somebody not already on the project. */}
      {assigningTo === "new" && showPeople && (
        <div className="mt-4 p-4 rounded-card border border-ink-200 bg-ink-50">
          <AssignForm
            projectId={project.id}
            divisions={divisions}
            workers={workers}
            availability={availability}
            onDone={() => {
              setAssigningTo(null);
              onChanged();
            }}
            onCancel={() => setAssigningTo(null)}
          />
        </div>
      )}

      {leaving && (
        <DomainRemoveResource
          projectId={project.id}
          person={leaving}
          canDelete={isAdmin}
          onClose={() => setLeaving(null)}
          onDone={(message) => {
            setLeaving(null);
            setRemoveNotice(message);
            onChanged();
          }}
        />
      )}

      {removeNotice && (
        <p className="text-sm text-brand-yellowText mt-2 border-l-4 border-brand-yellow pl-3 py-1">
          {removeNotice}
        </p>
      )}

      {!showPeople ? null : ordered.length === 0 ? (
        <p className="text-sm text-ink-400 italic mt-3">
          Nobody is allocated to this project yet. Book someone below, or
          use &ldquo;Assign to someone else&rdquo;.
        </p>
      ) : (
        <div className="grid gap-3 mt-3">
          {sections.booked.length === 0 && (
            <p className="text-sm text-ink-400 italic">
              Nobody is booked on this project.
            </p>
          )}
          {ordered.map((sec, i) => {
            const a = availability.get(sec.id);
            const assigned = sec.items.reduce((s, r) => s + r.assignedCount, 0);
            const delivered = sec.items.reduce((s, r) => s + r.deliveredCount, 0);
            const pending = sec.items.reduce((s, r) => s + r.pendingCount, 0);
            const pct = assigned > 0 ? (delivered / assigned) * 100 : 0;

            /** The heading for the second group, drawn once, above the
             *  first person in it. */
            const opensUnbooked = !sec.booked && i === sections.booked.length;

            return (
              <Fragment key={sec.id}>
                {opensUnbooked && (
                  <div className="mt-2">
                    <h4 className="font-heading text-sm font-semibold text-ink-700 uppercase tracking-wide">
                      Holding tags without a booking
                    </h4>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Not booked on this project, but still carrying tags on
                      it. Book them, or take them off — their submissions
                      stay in Approvals either way.
                    </p>
                  </div>
                )}
                <div className="rounded-card border border-ink-200 overflow-hidden">
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
                    {/* Only for the unbooked. Somebody with a booking is
                        removed by deleting the booking, which takes their
                        tags with it — two ways to do the same thing would
                        eventually disagree about what each one does. */}
                    {canAssign && !sec.booked && (
                      <button
                        onClick={() =>
                          setLeaving({ id: sec.id, name: sec.name })
                        }
                        title={`Take ${sec.name} off this project`}
                        aria-label={`Take ${sec.name} off this project`}
                        className="btn-ghost text-sm text-brand-redText border border-ink-200"
                      >
                        <Trash2 size={13} />
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
                          canCorrectDelivered={isAdmin}
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
              </Fragment>
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
}: {
  projectId: number;
  divisions: { id: number; name: string }[];
  workers: ForecastPerson[];
  availability: Map<string, Availability>;
  lockedAssignee?: { id: string; name: string };
  onDone: () => void;
  onCancel: () => void;
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

        {/* No rate field here. A person's tags/day belongs to their
            booking on the project — it is set when the resource is added —
            and offering it again while handing out tags invited two
            places to disagree about the same number. */}

        {divisions.length > 0 && (
          <label className="text-sm block">
            <span className="block text-ink-700 font-medium mb-1">Division</span>
            <SearchSelect
              value={divisionId}
              onChange={setDivisionId}
              placeholder="Pick a division…"
              searchPlaceholder="Search divisions"
              options={divisions.map((d) => ({
                value: String(d.id),
                label: d.name,
              }))}
            />
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
          <DateInput value={startDate} onChange={(iso: string) => setStartDate(iso)} className={dateClass("sm")} />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Target</span>
          <DateInput value={targetDate} onChange={(iso: string) => setTargetDate(iso)} className={dateClass("sm")} />
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
  canCorrectDelivered,
  onCancel,
  onSaved,
}: {
  row: AssignmentRow;
  divisions: { id: number; name: string }[];
  workers: ForecastPerson[];
  /**
   * Admins only. Everyone else moves delivery by approving a submission —
   * see the PATCH route, which refuses this field for other roles whatever
   * the browser sends.
   */
  canCorrectDelivered: boolean;
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
  /** Kept behind a toggle. Delivery is not an ordinary field, and an
   *  editable box sitting open beside the tag count invites the edit
   *  rather than waiting to be asked for. */
  const [correcting, setCorrecting] = useState(false);
  const [delivered, setDelivered] = useState(String(row.deliveredCount));
  const [reason, setReason] = useState("");
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
        // Only sent when the correction panel is open, so an ordinary
        // edit can never carry a delivered figure by accident.
        ...(correcting
          ? {
              deliveredCount: Number(delivered),
              correctionReason: reason,
            }
          : {}),
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
            <SearchSelect
              value={divisionId}
              onChange={setDivisionId}
              searchPlaceholder="Search divisions"
              options={divisions.map((d) => ({
                value: String(d.id),
                label: d.name,
              }))}
            />
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
          <DateInput value={startDate} onChange={(iso: string) => setStartDate(iso)} className={dateClass("sm")} />
        </label>
        <label className="text-xs">
          <span className="block text-ink-700 mb-1">Target</span>
          <DateInput value={targetDate} onChange={(iso: string) => setTargetDate(iso)} className={dateClass("sm")} />
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
      {canCorrectDelivered && (
        <div className="mt-2 pt-2 border-t border-ink-200">
          {!correcting ? (
            <button
              onClick={() => setCorrecting(true)}
              className="text-xs text-brand-blue"
            >
              Correct the delivered count ({row.deliveredCount})
            </button>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                <span className="block text-ink-700 mb-1">Delivered</span>
                <input
                  type="number"
                  min={0}
                  max={Number(count) || row.assignedCount}
                  value={delivered}
                  onChange={(e) => setDelivered(e.target.value)}
                  className="w-24 px-2 py-1 rounded border border-ink-200 text-sm"
                />
              </label>
              <label className="text-xs flex-1 min-w-[200px]">
                <span className="block text-ink-700 mb-1">
                  Why <span className="text-brand-redText">*</span>
                </span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. 400 delivered before this system, never recorded"
                  className="w-full px-2 py-1 rounded border border-ink-200 text-sm"
                />
              </label>
              <button
                onClick={() => {
                  setCorrecting(false);
                  setDelivered(String(row.deliveredCount));
                  setReason("");
                }}
                className="btn-ghost text-xs"
              >
                Cancel correction
              </button>
              <p className="text-[11px] text-ink-500 w-full">
                Was <strong>{row.deliveredCount}</strong>. This goes on the
                record with your name against it, and Save applies it.
              </p>
            </div>
          )}

          {/* What has already been corrected here. Kept visible so nobody
              has to wonder why a figure does not match the submissions
              behind it. */}
          {(row.corrections ?? []).length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {(row.corrections ?? []).map((c) => (
                <li key={c.id} className="text-[11px] text-ink-500">
                  {fmt(c.at.slice(0, 10))} · {c.by} set delivered{" "}
                  <strong>{c.before}</strong> → <strong>{c.after}</strong> —{" "}
                  <span className="italic">&ldquo;{c.reason}&rdquo;</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ResourceDetail a={availability.get(assigneeId)} />
      {error && <p className="text-xs text-brand-redText mt-1.5">{error}</p>}
    </li>
  );
}
