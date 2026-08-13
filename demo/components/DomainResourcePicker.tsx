"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  DOMAIN_ROLE_LABELS,
  WORKING_ROLES,
  type DomainRole,
} from "@/lib/domain";

/**
 * Shared "who's free?" affordance for every place a Lead picks a person —
 * creating or editing a project, assigning tags, adding a task, or running
 * a simulation. All of them read the same endpoint and speak the same
 * language, so "busy until the 31st, free the 1st, 80 tags/day" means the
 * same thing everywhere it appears.
 */

export type Availability = {
  id: string;
  name: string;
  role: DomainRole;
  status: "Free" | "Allocated";
  availableFrom: string | null;
  rate: number;
  usingDefaultRate: boolean;
  projects: {
    projectId: number;
    projectName: string;
    startDate: string;
    endDate: string;
    assignedTags: number;
    deliveredTags: number;
    openTags: number;
  }[];
};

export function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Loads availability once per mounted picker. Restricted to the roles that
 * can assign work; for anyone else the map simply stays empty and the
 * pickers fall back to plain names rather than erroring.
 */
export function useAvailability(enabled = true): {
  byId: Map<string, Availability>;
  list: Availability[];
  loaded: boolean;
  reload: () => void;
} {
  const [list, setList] = useState<Availability[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch("/api/domain/resources/availability", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { resources: [] }))
      .then((b) => {
        if (!alive) return;
        setList(b.resources ?? []);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [enabled, nonce]);

  return {
    byId: new Map(list.map((a) => [a.id, a])),
    list,
    loaded,
    reload: () => setNonce((n) => n + 1),
  };
}

/** Rate phrased for humans: measured from approved work, or an assumption. */
export function rateText(a: Availability): string {
  return `${a.rate}/day${a.usingDefaultRate ? " (assumed)" : ""}`;
}

/**
 * One line of plain text for a `<select>` option, which can't take markup.
 * Free people say so in three words; busy people get what they're on and
 * when they come free.
 */
export function availabilityLabel(name: string, a?: Availability): string {
  if (!a) return name;
  if (a.status === "Free" || a.projects.length === 0) {
    return `${name} — Free · ${rateText(a)}`;
  }
  const where =
    a.projects.length === 1
      ? a.projects[0].projectName
      : `${a.projects.length} projects`;
  return `${name} — Busy on ${where}, free ${fmtDay(a.availableFrom)} · ${rateText(a)}`;
}

/**
 * The expanded read on someone, shown under a dropdown once they're
 * picked: every booking with its window and outstanding tags, the date
 * they free up, and how fast they actually go.
 */
export function ResourceDetail({ a }: { a?: Availability }) {
  if (!a) return null;

  if (a.status === "Free" || a.projects.length === 0) {
    return (
      <div className="mt-2 p-2.5 rounded bg-brand-greenBg text-xs">
        <div className="flex items-center gap-1.5 font-medium text-brand-greenText">
          <CheckCircle2 size={12} /> {a.name} is free — nothing booked
        </div>
        <div className="text-ink-700 mt-0.5">
          Averages {rateText(a)}
          {a.usingDefaultRate && " — no approved history yet"}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 p-2.5 rounded bg-brand-yellowBg border border-brand-yellowBorder text-xs">
      <div className="flex items-center gap-1.5 font-medium text-brand-yellowText">
        <AlertTriangle size={12} /> {a.name} is already working on:
      </div>
      <ul className="mt-1 space-y-0.5 text-ink-700">
        {a.projects.map((p) => (
          <li key={p.projectId}>
            <span className="font-medium">{p.projectName}</span> ·{" "}
            {fmtDay(p.startDate)} → {fmtDay(p.endDate)}
            {p.openTags > 0 && ` · ${p.openTags} tags still open`}
          </li>
        ))}
      </ul>
      <div className="text-ink-700 mt-1">
        Frees up <span className="font-medium">{fmtDay(a.availableFrom)}</span> ·
        averages {rateText(a)}
      </div>
    </div>
  );
}

/**
 * The switch itself. Purely visual — the row around it carries the button
 * semantics, so this is marked aria-hidden to avoid announcing twice.
 */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative mt-0.5 w-9 h-5 rounded-pill shrink-0 transition-colors ${
        on ? "bg-brand-blue" : "bg-ink-200"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-pill bg-white shadow-sm transition-all ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </span>
  );
}

/** Compact status chip for list rows. */
function StatusChip({ a }: { a?: Availability }) {
  if (!a) return null;
  const free = a.status === "Free" || a.projects.length === 0;
  return (
    <span
      className={`px-1.5 py-0.5 rounded-pill text-[11px] font-medium shrink-0 ${
        free
          ? "bg-brand-greenBg text-brand-greenText"
          : "bg-brand-yellowBg text-brand-yellowText"
      }`}
    >
      {free ? "Free" : "Busy"}
    </span>
  );
}

/**
 * Multi-select list of people with their availability inline — used
 * wherever a Lead picks several at once (allocating a project, running a
 * simulation, splitting a batch of tasks).
 */
export function ResourceChecklist({
  people,
  picked,
  onToggle,
  availability,
  emptyLabel = "No allocatable people yet.",
  maxHeight = "max-h-64",
  suffix,
}: {
  people: { id: string; name: string; role: string }[];
  picked: string[];
  onToggle: (id: string, next: boolean) => void;
  availability: Map<string, Availability>;
  emptyLabel?: string;
  maxHeight?: string;
  /** Extra per-row content, e.g. the share of a batch this person would get. */
  suffix?: (id: string) => React.ReactNode;
}) {
  const [role, setRole] = useState<"all" | DomainRole>("all");
  const [query, setQuery] = useState("");

  /** The rate we'd plan with — used to order people fastest-first. */
  const rateOf = (id: string) => availability.get(id)?.rate ?? 0;

  // Roles stay separable rather than one mixed list — picking "who are my
  // Actionees" is a different question from "who is free".
  // Grouped by role, and inside each group the highest average tags/day
  // first — a PM picking resources wants the strongest option at the top
  // of the relevant group, not a single mixed list.
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = people.filter((p) => {
      if (role !== "all" && p.role !== role) return false;
      return !q || p.name.toLowerCase().includes(q);
    });
    return WORKING_ROLES.map((r) => ({
      role: r,
      people: matching
        .filter((p) => p.role === r)
        .sort((a, b) => {
          const d = rateOf(b.id) - rateOf(a.id);
          return d !== 0 ? d : a.name.localeCompare(b.name);
        }),
    })).filter((g) => g.people.length > 0);
  }, [people, role, query, availability]);

  const shownCount = sections.reduce((n, g) => n + g.people.length, 0);

  if (people.length === 0) {
    return <p className="text-xs text-ink-400 italic">{emptyLabel}</p>;
  }

  const selectedRate = picked.reduce(
    (n, id) => n + (availability.get(id)?.rate ?? 0),
    0,
  );

  return (
    <div>
      {/* What's switched on, so the toggles add up to something. */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <span className="text-xs text-ink-500">
          {picked.length === 0 ? (
            "Nobody selected yet"
          ) : (
            <>
              <strong className="text-ink-900">{picked.length}</strong> selected
              {selectedRate > 0 && (
                <>
                  {" "}
                  · <strong className="text-ink-900">
                    {Math.round(selectedRate * 100) / 100}
                  </strong>{" "}
                  tags/day combined
                </>
              )}
            </>
          )}
        </span>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => picked.forEach((id) => onToggle(id, false))}
            className="text-xs text-brand-blue"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 mb-1.5 flex-wrap">
        {(["all", ...WORKING_ROLES] as const).map((key) => {
          const n =
            key === "all"
              ? people.length
              : people.filter((p) => p.role === key).length;
          if (key !== "all" && n === 0) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setRole(key)}
              className={`px-2 py-0.5 rounded-pill text-[11px] font-medium border ${
                role === key
                  ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                  : "bg-white text-ink-600 border-ink-200"
              }`}
            >
              {key === "all" ? "All" : DOMAIN_ROLE_LABELS[key]} {n}
            </button>
          );
        })}
        {people.length > 6 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="ml-auto px-2 py-0.5 rounded border border-ink-200 text-xs w-32"
          />
        )}
      </div>
      <div
      className={`border border-ink-200 rounded ${maxHeight} overflow-y-auto divide-y divide-ink-100`}
    >
      {shownCount === 0 && (
        <p className="text-xs text-ink-400 italic p-2">Nobody matches.</p>
      )}
      {sections.map((g) => (
        <div key={g.role}>
          {/* Role heading, so Team Leads and Actionees never run together. */}
          {/* z-10: the toggles below are `relative`, so without an explicit
              level they'd paint over this header as rows scroll under it —
              positioned siblings later in the DOM win at z-index auto. */}
          <div className="sticky top-0 z-10 bg-ink-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500 border-b border-ink-200">
            {DOMAIN_ROLE_LABELS[g.role]}s · {g.people.length}
          </div>
          {g.people.map((p, idx) => {
            const a = availability.get(p.id);
            const on = picked.includes(p.id);
            const free = !a || a.status === "Free" || a.projects.length === 0;
            return (
              // The whole row is the switch: one control, one hit target,
              // and no nested interactive elements to trip over.
              <button
                key={p.id}
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Allocate ${p.name}`}
                onClick={() => onToggle(p.id, !on)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left border-b border-ink-100 transition ${
                  on ? "bg-brand-blueBg/50" : "hover:bg-ink-50"
                }`}
              >
                <Toggle on={on} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-sm truncate ${on ? "text-ink-900 font-medium" : "text-ink-900"}`}
                    >
                      {p.name}
                    </span>
                    <StatusChip a={a} />
                    {/* Fastest in this role group, when the rate is real. */}
                    {idx === 0 && a && !a.usingDefaultRate && (
                      <span className="text-[10px] font-medium text-brand-greenText bg-brand-greenBg px-1.5 py-0.5 rounded-pill shrink-0">
                        fastest
                      </span>
                    )}
                    {a && (
                      <span className="ml-auto shrink-0 text-xs font-semibold text-ink-900">
                        {a.rate}/day
                      </span>
                    )}
                    {suffix && <span className="shrink-0">{suffix(p.id)}</span>}
                  </span>
                  <span className="block text-xs text-ink-500 mt-0.5">
                    {a && free && `Free now · ${rateText(a)}`}
                    {a && !free && (
                      <>
                        {a.projects.length === 1
                          ? a.projects[0].projectName
                          : `${a.projects.length} projects`}{" "}
                        until {fmtDay(a.availableFrom)} · {rateText(a)}
                      </>
                    )}
                    {!a && (DOMAIN_ROLE_LABELS[p.role as DomainRole] ?? p.role)}
                  </span>
                  {a && !free && a.projects.some((x) => x.openTags > 0) && (
                    <span className="block text-xs text-brand-yellowText mt-0.5">
                      {a.projects.reduce((t, x) => t + x.openTags, 0)} tags still open
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      </div>
    </div>
  );
}

/**
 * Single-select person picker, grouped by role and ordered fastest-first
 * inside each group. `<optgroup>` is the only structure a native select
 * supports, so Team Leads, SMEs and Actionees stay visually apart in the
 * same way the checklist separates them.
 */
export function ResourceSelect({
  people,
  value,
  onChange,
  availability,
  placeholder = "Pick…",
  className = "px-2 py-1.5 rounded border border-ink-200 text-sm",
}: {
  people: { id: string; name: string; role: string }[];
  value: string;
  onChange: (id: string) => void;
  availability: Map<string, Availability>;
  placeholder?: string;
  className?: string;
}) {
  const rateOf = (id: string) => availability.get(id)?.rate ?? 0;
  const groups = WORKING_ROLES.map((role) => ({
    role,
    people: people
      .filter((p) => p.role === role)
      .sort((a, b) => {
        const d = rateOf(b.id) - rateOf(a.id);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      }),
  })).filter((g) => g.people.length > 0);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.role} label={`${DOMAIN_ROLE_LABELS[g.role]}s`}>
          {g.people.map((p, i) => {
            // A native select renders the chosen option's own text in the
            // collapsed box, so the selected person is rendered as a bare
            // name: you get the full "busy until…, N/day" read while
            // choosing, and a clean name once it's decided. The detail
            // panel underneath still carries the specifics.
            if (p.id === value) {
              return (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              );
            }
            const a = availability.get(p.id);
            const star = i === 0 && a && !a.usingDefaultRate ? "★ " : "";
            return (
              <option key={p.id} value={p.id}>
                {star}
                {availabilityLabel(p.name, a)}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}

/**
 * The person's average tags/day, editable in place.
 *
 * A Lead assigning work often knows better than the history does —
 * especially before there is any — so the number they plan against can be
 * set right here rather than in a separate admin screen. Saving writes the
 * person's expected rate, which every forecast then picks up.
 */
export function RateField({
  userId,
  availability,
  onSaved,
}: {
  userId: string;
  availability: Map<string, Availability>;
  onSaved?: () => void;
}) {
  const a = availability.get(userId);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(a ? String(a.rate) : "");
    setSaved(false);
    setError(null);
  }, [userId, a?.rate]);

  if (!userId) return null;

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a positive number.");
      return;
    }
    if (a && n === a.rate) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/domain/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedTagsPerDay: n }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Couldn't save that.");
      return;
    }
    setSaved(true);
    onSaved?.();
  }

  return (
    <label className="text-sm relative">
      <span className="block text-ink-700 mb-1">Avg tags/day</span>
      <input
        type="number"
        min={1}
        step="0.5"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        title="What this person averages. Edit to set the rate forecasts use."
        className="w-24 px-2 py-1.5 rounded border border-ink-200"
      />
      {/* Out of flow: in an items-end row, a status line under the input
          would push this control up out of line with its siblings. */}
      <span className="absolute left-0 top-full mt-0.5 block text-[11px] whitespace-nowrap">
        {error ? (
          <span className="text-brand-redText">{error}</span>
        ) : saving ? (
          <span className="text-ink-400">saving…</span>
        ) : saved ? (
          <span className="text-brand-greenText">saved</span>
        ) : a && !a.usingDefaultRate ? (
          <span className="text-ink-400">measured</span>
        ) : (
          <span className="text-ink-400">assumed — set it</span>
        )}
      </span>
    </label>
  );
}
