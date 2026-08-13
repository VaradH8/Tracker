"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Trash2, UserPlus } from "lucide-react";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import {
  ResourceSelect,
  useAvailability,
  type Availability,
} from "@/components/DomainResourcePicker";

/**
 * Who is booked on this project, for how long, and how fast each of them is
 * expected to go *here*.
 *
 * Allocation used to be buried in the project edit form as a row of
 * checkboxes — you could add and remove people but not see or change a
 * booking's window, and there was nowhere to say "Mukesh manages 40 tags a
 * day on this one". This panel owns all of that.
 */

export type ProjectResource = {
  allocationId: number;
  id: string;
  name: string;
  role?: string;
  startDate: string;
  endDate: string;
  releasedAt: string | null;
  expectedTagsPerDay: number | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The rate this project will actually plan with, and where it came from. */
function effectiveFor(
  r: ProjectResource,
  a: Availability | undefined,
): { rate: number; source: string } {
  if (r.expectedTagsPerDay != null) {
    return { rate: r.expectedTagsPerDay, source: "set for this project" };
  }
  if (a && !a.usingDefaultRate) return { rate: a.rate, source: "measured" };
  return { rate: a?.rate ?? 8, source: "assumed" };
}

export function DomainProjectResources({
  projectId,
  projectStart,
  projectEnd,
  resources,
  people,
  canManage,
  onChanged,
}: {
  projectId: number;
  projectStart: string | null;
  projectEnd: string | null;
  resources: ProjectResource[];
  people: { id: string; name: string; role: string }[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { byId: availability, reload } = useAvailability(canManage);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allocated = new Set(resources.map((r) => r.id));
  const addable = people.filter(
    (p) =>
      ["Actionee", "SME", "TeamLead"].includes(p.role) && !allocated.has(p.id),
  );

  const combined = resources.reduce(
    (sum, r) => sum + effectiveFor(r, availability.get(r.id)).rate,
    0,
  );

  async function remove(allocationId: number) {
    setError(null);
    const res = await fetch(`/api/domain/allocations/${allocationId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Couldn't remove that booking.");
      return;
    }
    onChanged();
    reload();
  }

  return (
    <section className="card p-5 mb-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="font-heading text-lg font-semibold text-ink-900">
            Resource allocation
          </h3>
          <p className="text-sm text-ink-500 mt-0.5">
            {resources.length === 0
              ? "Nobody is booked on this project yet."
              : `${resources.length} booked · combined ${Math.round(combined * 100) / 100} tags/day`}
          </p>
        </div>
        {canManage && addable.length > 0 && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="btn-primary text-sm"
          >
            <UserPlus size={14} className="mr-1.5" /> Allocate someone
          </button>
        )}
      </div>

      {error && <p className="text-sm text-brand-redText mb-3">{error}</p>}

      {adding && (
        <AllocateForm
          projectId={projectId}
          projectStart={projectStart}
          projectEnd={projectEnd}
          people={addable}
          availability={availability}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            onChanged();
            reload();
          }}
        />
      )}

      {resources.length === 0 ? (
        !adding && (
          <p className="text-sm text-ink-400 italic">
            Allocate people so the forecast knows who is delivering this work.
          </p>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Person</th>
                <th className="text-left font-semibold px-3 py-2">Booked</th>
                <th className="text-right font-semibold px-3 py-2">
                  Tags/day here
                </th>
                <th className="text-left font-semibold px-3 py-2">Source</th>
                {canManage && <th className="px-3 py-2 w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {resources.map((r) => {
                const a = availability.get(r.id);
                const eff = effectiveFor(r, a);
                if (editing === r.allocationId) {
                  return (
                    <EditAllocationRow
                      key={r.allocationId}
                      r={r}
                      measured={a && !a.usingDefaultRate ? a.rate : null}
                      onCancel={() => setEditing(null)}
                      onSaved={() => {
                        setEditing(null);
                        onChanged();
                        reload();
                      }}
                    />
                  );
                }
                return (
                  <tr key={r.allocationId}>
                    <td className="px-3 py-2">
                      <div className="text-ink-900 font-medium">{r.name}</div>
                      <div className="text-xs text-ink-500">
                        {DOMAIN_ROLE_LABELS[
                          (r.role ?? a?.role) as DomainRole
                        ] ?? r.role}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink-700 whitespace-nowrap">
                      {fmt(r.startDate)} → {fmt(r.releasedAt ?? r.endDate)}
                      {r.releasedAt && (
                        <div className="text-xs text-ink-400">released early</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-heading font-semibold text-ink-900">
                        {eff.rate}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs ${
                          r.expectedTagsPerDay != null
                            ? "text-brand-blue font-medium"
                            : eff.source === "measured"
                              ? "text-ink-500"
                              : "text-brand-yellowText"
                        }`}
                      >
                        {eff.source}
                      </span>
                      {r.expectedTagsPerDay != null &&
                        a &&
                        !a.usingDefaultRate && (
                          <div className="text-[11px] text-ink-400">
                            measures {a.rate}
                          </div>
                        )}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(r.allocationId)}
                          className="btn-ghost text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => remove(r.allocationId)}
                          className="btn-ghost text-xs text-brand-redText"
                          aria-label={`Remove ${r.name} from this project`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Book a new person, with their window and this project's rate. */
function AllocateForm({
  projectId,
  projectStart,
  projectEnd,
  people,
  availability,
  onCancel,
  onDone,
}: {
  projectId: number;
  projectStart: string | null;
  projectEnd: string | null;
  people: { id: string; name: string; role: string }[];
  availability: Map<string, Availability>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [startDate, setStartDate] = useState(projectStart ?? "");
  const [endDate, setEndDate] = useState(projectEnd ?? "");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<
    { projectName: string; startDate: string; endDate: string; availableFrom: string }[]
  >([]);

  async function submit(force = false) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/domain/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        userId,
        startDate: startDate || null,
        endDate: endDate || null,
        expectedTagsPerDay: rate ? Number(rate) : undefined,
        acknowledgeConflicts: force,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409) {
      setConflicts(body.conflicts ?? []);
      setError(body.error ?? "Already allocated over these dates.");
      return;
    }
    if (!res.ok) {
      setError(body.error ?? "Couldn't allocate.");
      return;
    }
    onDone();
  }

  const picked = availability.get(userId);

  return (
    <div className="p-4 rounded-card border border-ink-200 bg-ink-50 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Person</span>
          <ResourceSelect
            people={people}
            value={userId}
            onChange={(v) => {
              setUserId(v);
              setConflicts([]);
              setError(null);
            }}
            availability={availability}
            className="px-2 py-1.5 rounded border border-ink-200 text-sm min-w-[240px]"
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">To</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Tags/day here</span>
          <input
            type="number"
            min={1}
            step="0.5"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={picked ? String(picked.rate) : "auto"}
            title="Leave blank to use their measured average"
            className="w-28 px-2 py-1.5 rounded border border-ink-200"
          />
        </label>
        <button
          onClick={() => submit(false)}
          disabled={busy || !userId}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? "Allocating…" : "Allocate"}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>

      {picked && (
        <p className="text-xs text-ink-500 mt-2">
          {picked.name} averages <strong>{picked.rate}/day</strong>
          {picked.usingDefaultRate && " (assumed — no approved history yet)"}.
          Leave the box blank to use that.
        </p>
      )}

      {conflicts.length > 0 && (
        <div className="mt-3 p-3 rounded bg-brand-yellowBg border border-brand-yellowBorder">
          <div className="flex items-center gap-1.5 text-sm font-medium text-brand-yellowText">
            <AlertTriangle size={14} /> Already booked over these dates
          </div>
          <ul className="mt-1 space-y-0.5">
            {conflicts.map((c) => (
              <li key={c.projectName} className="text-xs text-ink-700">
                {c.projectName} · {fmt(c.startDate)} → {fmt(c.endDate)} · free{" "}
                {fmt(c.availableFrom)}
              </li>
            ))}
          </ul>
          <button
            onClick={() => submit(true)}
            disabled={busy}
            className="btn-primary text-sm mt-2"
          >
            Allocate anyway
          </button>
        </div>
      )}

      {error && conflicts.length === 0 && (
        <p className="text-sm text-brand-redText mt-2">{error}</p>
      )}
    </div>
  );
}

/** Change one booking's window, its rate, or release the person early. */
function EditAllocationRow({
  r,
  measured,
  onCancel,
  onSaved,
}: {
  r: ProjectResource;
  measured: number | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [startDate, setStartDate] = useState(r.startDate);
  const [endDate, setEndDate] = useState(r.endDate);
  const [rate, setRate] = useState(
    r.expectedTagsPerDay != null ? String(r.expectedTagsPerDay) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/domain/allocations/${r.allocationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate,
        endDate,
        // Empty clears the override and hands the rate back to measurement.
        expectedTagsPerDay: rate === "" ? null : Number(rate),
        ...extra,
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

  return (
    <tr className="bg-ink-50">
      <td className="px-3 py-2 align-top">
        <div className="text-ink-900 font-medium">{r.name}</div>
        {error && (
          <div className="text-xs text-brand-redText mt-1">{error}</div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-1.5 py-1 rounded border border-ink-200 text-xs"
          />
          <span className="text-ink-400">→</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-1.5 py-1 rounded border border-ink-200 text-xs"
          />
        </div>
        {r.releasedAt && (
          <button
            onClick={() => save({ releasedAt: null })}
            className="text-[11px] text-brand-blue mt-1"
          >
            Undo early release ({fmt(r.releasedAt)})
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min={1}
          step="0.5"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={measured != null ? String(measured) : "auto"}
          className="w-20 px-1.5 py-1 rounded border border-ink-200 text-xs text-right"
        />
      </td>
      <td className="px-3 py-2 text-xs text-ink-500">
        {rate === ""
          ? measured != null
            ? `will use measured ${measured}`
            : "will use the default"
          : "set for this project"}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button
          onClick={() => save()}
          disabled={busy}
          className="btn-primary text-xs disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs">
          Cancel
        </button>
      </td>
    </tr>
  );
}
