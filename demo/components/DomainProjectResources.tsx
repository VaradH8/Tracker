"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Plus, Trash2, UserPlus } from "lucide-react";
import {
  DOMAIN_ROLE_LABELS,
  TAG_HOLDER_ROLES,
  type DomainRole,
} from "@/lib/domain";
import {
  ResourceSelect,
  ResourceDetail,
  useAvailability,
  type Availability,
} from "@/components/DomainResourcePicker";
import { fmtDate as fmt } from "@/lib/domain-format";
import { dateClass, inputClass } from "@/lib/domain-ui";
import { DateInput } from "@/components/DateInput";
import { DomainRemoveResource } from "@/components/DomainRemoveResource";
import { useDomain } from "@/lib/domain-store";

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


/**
 * The rate this project plans with, and where it came from. Returns null
 * rather than a stand-in figure when neither a Lead nor the history has
 * produced one — the row then says so instead of showing an invented
 * number that reads as fact.
 */
function effectiveFor(
  r: ProjectResource,
  a: Availability | undefined,
): { rate: number; source: string } | null {
  if (r.expectedTagsPerDay != null) {
    return { rate: r.expectedTagsPerDay, source: "set for this project" };
  }
  // `a.rate` is the rate set on the person, or null. Nothing is measured
  // and nothing is inferred: a plan runs on figures a human stands behind.
  if (a?.rate != null) {
    return { rate: a.rate, source: "set for this person" };
  }
  return null;
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
  /**
   * Folded away by default, like the tags panel above it.
   *
   * Bookings are set up once and then read rarely; the summary line —
   * how many people and what they add up to a day — is what a visit
   * usually needs. Open it to change something.
   */
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Who is being taken off, while the dialog is up. */
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(
    null,
  );
  const { current } = useDomain();

  const allocated = new Set(resources.map((r) => r.id));
  const addable = people.filter(
    (p) =>
      TAG_HOLDER_ROLES.includes(p.role as DomainRole) && !allocated.has(p.id),
  );

  // People without a rate contribute nothing rather than a guessed figure,
  // so the combined number only ever adds up rates someone stands behind.
  const combined = resources.reduce(
    (sum, r) => sum + (effectiveFor(r, availability.get(r.id))?.rate ?? 0),
    0,
  );
  const unrated = resources.filter(
    (r) => effectiveFor(r, availability.get(r.id)) === null,
  ).length;

  /**
   * Both ways off a project live in one dialog — see
   * components/DomainRemoveResource. Remove and Delete look alike and are
   * not, so the choice is made on a screen that states what each costs,
   * rather than by picking between two icons in a table row.
   */
  function finished(message: string) {
    setLeaving(null);
    setNotice(message);
    onChanged();
    reload();
  }

  return (
    <section className="card p-5 mb-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left min-w-0"
        >
          <ChevronDown
            size={18}
            className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
          <span className="min-w-0">
            <span className="block font-heading text-lg font-semibold text-ink-900">
              Resource allocation
            </span>
            <span className="block text-sm text-ink-500">
              {resources.length === 0
                ? "Nobody is booked on this project yet."
                : `${resources.length} booked · combined ${Math.round(combined * 100) / 100} tags/day${
                    unrated > 0
                      ? ` · ${unrated} without a rate`
                      : ""
                  }`}
            </span>
          </span>
        </button>
        {canManage && addable.length > 0 && (
          <button
            onClick={() => {
              setOpen(true);
              setAdding((v) => !v);
            }}
            className="btn-primary text-sm shrink-0"
          >
            <UserPlus size={14} className="mr-1.5" /> Allocate someone
          </button>
        )}
      </div>

      {leaving && (
        <DomainRemoveResource
          projectId={projectId}
          person={leaving}
          canDelete={current?.role === "Admin"}
          onClose={() => setLeaving(null)}
          onDone={finished}
        />
      )}

      {error && <p className="text-sm text-brand-redText mt-3">{error}</p>}
      {/* Shown whether or not the panel is open: it reports tags that just
          left the project, which nobody should have to expand a section to
          find out about. */}
      {notice && (
        <p className="text-sm text-brand-yellowText mt-3 border-l-4 border-brand-yellow pl-3 py-1">
          {notice}
        </p>
      )}

      {adding && open && (
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

      {!open ? null : resources.length === 0 ? (
        !adding && (
          <p className="text-sm text-ink-400 italic mt-4">
            Allocate people so the forecast knows who is delivering this work.
          </p>
        )
      ) : (
        // overflow-x-auto is a clipping context, which is why the pickers
        // inside this table render their lists into document.body rather
        // than beside themselves — see components/SearchSelect.
        <div className="overflow-x-auto mt-4">
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
                      // What clearing the box falls back to: the rate
                      // set on the person, or nothing at all.
                      fallback={a?.rate ?? null}
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
                      {eff ? (
                        <span className="font-heading font-semibold text-ink-900">
                          {eff.rate}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs ${
                          !eff
                            ? "text-brand-yellowText"
                            : r.expectedTagsPerDay != null
                              ? "text-brand-blue font-medium"
                              : "text-ink-500"
                        }`}
                      >
                        {eff ? eff.source : "not set — edit to add one"}
                      </span>

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
                          onClick={() => setLeaving({ id: r.id, name: r.name })}
                          title={`Take ${r.name} off this project`}
                          aria-label={`Take ${r.name} off this project`}
                          className="btn-ghost text-xs text-brand-redText"
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
        <ResourceSelect
          label="Person"
          people={people}
          value={userId}
          onChange={(v) => {
            setUserId(v);
            setConflicts([]);
            setError(null);
          }}
          availability={availability}
        />
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">From</span>
          <DateInput value={startDate} onChange={(iso: string) => setStartDate(iso)} className={dateClass("md")} />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">To</span>
          <DateInput value={endDate} min={startDate || undefined} onChange={(iso: string) => setEndDate(iso)} className={dateClass("md")} />
        </label>
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">
            Avg tags/day <span className="text-brand-redText">*</span>
          </span>
          <input
            type="number"
            min={1}
            step="0.5"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            // No placeholder carrying their rate from elsewhere: it looked
            // prefilled, and the point of this field is that a rate belongs
            // to one booking. Somebody managing 60 a day on one project is
            // not thereby managing 60 on the next. What they are already
            // set at is stated below in words, where it reads as context
            // rather than as a default.
            placeholder="e.g. 40"
            title="What you expect this person to average on THIS project"
            className={inputClass("md", "w-28")}
          />
        </label>
        <button
          onClick={() => submit(false)}
          // The rate is what every projection on this project is built
          // from, so it is set deliberately when the person is added
          // rather than inferred and quietly wrong.
          disabled={busy || !userId || !rate}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? "Allocating…" : "Allocate"}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>

      {/* The same read on a person the other pickers give, rather than a
          one-line summary unique to this panel. */}
      {picked && (
        <>
          <ResourceDetail a={picked} />
          {/* What they are already set at, if anything — not what they
              have averaged. A measured figure here invited the reader to
              plan against it, and one backdated batch is enough to make
              that number nonsense. */}
          <p className="text-xs text-ink-500 mt-1">
            {picked.rate === null
              ? "No rate set for them yet — set what you expect on this project."
              : `They are set at ${picked.rate}/day. Set what you expect on this project.`}
          </p>
        </>
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
  /** The rate this booking falls back to when its own box is cleared. */
  fallback,
  onCancel,
  onSaved,
}: {
  r: ProjectResource;
  fallback: number | null;
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
          <DateInput value={startDate} onChange={(iso: string) => setStartDate(iso)} className={dateClass("sm")} />
          <span className="text-ink-400">→</span>
          <DateInput value={endDate} min={startDate} onChange={(iso: string) => setEndDate(iso)} className={dateClass("sm")} />
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
          placeholder={fallback != null ? String(fallback) : "not set"}
          className="w-20 px-1.5 py-1 rounded border border-ink-200 text-xs text-right"
        />
      </td>
      <td className="px-3 py-2 text-xs text-ink-500">
        {rate === ""
          ? fallback != null
            ? `will use their own ${fallback}/day`
            : "no rate — this person plans nothing"
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
