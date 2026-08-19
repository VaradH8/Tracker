"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import { fmtWeekday as fmt } from "@/lib/domain-format";
import { dateClass, inputClass } from "@/lib/domain-ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useDomain } from "@/lib/domain-store";
import { DateInput } from "@/components/DateInput";

/**
 * The team's work log, for the people entitled to read it.
 *
 * Visibility follows the reporting line: an Admin reads everyone, a Lead
 * reads Team Leads and below, a Team Lead reads SMEs and Actionees. Nobody
 * reads the people above them. Your own entries appear here too, since the
 * separate "My log" they used to live under is gone.
 *
 * An entry can only be changed by the person who wrote it — not by a Lead,
 * not by an Admin. It is their own account of their day, and somebody else
 * editing it would be rewriting what that person said rather than
 * correcting a record. So the controls appear on your own rows and nowhere
 * else.
 *
 * That scoping is enforced server-side — this view only asks. The person
 * filter is built from the same scoped response, so it can only ever offer
 * people the viewer is already allowed to read.
 */

type TeamLog = {
  id: number;
  hours: number;
  note: string;
  date: string;
  user: string;
  userId: string;
  userRole: DomainRole;
  project: string | null;
  task: string | null;
};


/**
 * Entries before this date are kept in the database but not shown.
 *
 * Hours entry was removed from the module on 16 August 2026, so anything
 * dated earlier belongs to a retired feature: a handful of rows that can
 * never grow, sitting on a screen people still open. Hiding them is a
 * display decision — nothing is deleted, and the API still returns
 * everything, so the record survives if hours ever come back.
 *
 * A date, deliberately, rather than a list of row ids. "Hide these three
 * entries" is a rule nobody can interpret in six months; "hide what
 * predates the feature being retired" explains itself.
 */
const LEGACY_CUTOFF = "2026-08-16";

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export function DomainTeamLogs() {
  const { current } = useDomain();
  const [logs, setLogs] = useState<TeamLog[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [person, setPerson] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ all: "true" });
    if (person !== "all") qs.set("userId", person);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`/api/domain/worklogs?${qs.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load the team's logs.");
        return r.json();
      })
      .then((b) => {
        setLogs(b.logs ?? []);
        setError(null);
      })
      .catch((e: Error) => {
        setLogs([]);
        setError(e.message);
      });
  }, [person, from, to]);

  useEffect(load, [load]);

  // The person list comes from an unfiltered read, so picking someone
  // doesn't shrink the list you picked them from.
  const [people, setPeople] = useState<{ id: string; name: string; role: DomainRole }[]>(
    [],
  );
  useEffect(() => {
    fetch("/api/domain/worklogs?all=true", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((b) => {
        const m = new Map<string, { id: string; name: string; role: DomainRole }>();
        for (const l of b.logs ?? []) {
          m.set(l.userId, { id: l.userId, name: l.user, role: l.userRole });
        }
        setPeople(
          Array.from(m.values()).sort((a, b2) => a.name.localeCompare(b2.name)),
        );
      })
      .catch(() => setPeople([]));
  }, []);

  /** What this screen shows: everything the API returned, minus the
   *  retired-feature backlog. Totals are computed from the same set, so the
   *  figures can never disagree with the table under them. */
  const shown = useMemo(
    () => (logs ?? []).filter((l) => l.date >= LEGACY_CUTOFF),
    [logs],
  );

  const totals = useMemo(() => {
    const rows = shown;
    return {
      hours: Math.round(rows.reduce((s, l) => s + l.hours, 0) * 100) / 100,
      entries: rows.length,
      people: new Set(rows.map((l) => l.userId)).size,
    };
  }, [shown]);

  const active = person !== "all" || !!from || !!to;

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-sm">
            <span className="block text-ink-700 mb-1">Person</span>
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="px-2 py-1.5 rounded border border-ink-200 text-sm min-w-[200px]"
            >
              <option value="all">Everyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {DOMAIN_ROLE_LABELS[p.role] ?? p.role}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-ink-700 mb-1">From</span>
            <DateInput value={from} max={to || undefined} onChange={(iso: string) => setFrom(iso)} className={dateClass("md")} />
          </label>
          <label className="text-sm">
            <span className="block text-ink-700 mb-1">To</span>
            <DateInput value={to} min={from || undefined} onChange={(iso: string) => setTo(iso)} className={dateClass("md")} />
          </label>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setFrom(todayISO());
                setTo(todayISO());
              }}
              className="btn-ghost border border-ink-200 text-xs"
            >
              Today
            </button>
            <button
              onClick={() => {
                setFrom(daysAgoISO(6));
                setTo(todayISO());
              }}
              className="btn-ghost border border-ink-200 text-xs"
            >
              Last 7 days
            </button>
            {active && (
              <button
                onClick={() => {
                  setPerson("all");
                  setFrom("");
                  setTo("");
                }}
                className="btn-ghost text-xs"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-ink-100">
          <div>
            <div className="text-[11px] text-ink-500 uppercase tracking-wide font-medium">
              Hours
            </div>
            <div className="font-heading text-2xl font-semibold">{totals.hours}</div>
          </div>
          <div>
            <div className="text-[11px] text-ink-500 uppercase tracking-wide font-medium">
              Entries
            </div>
            <div className="font-heading text-2xl font-semibold">
              {totals.entries}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-ink-500 uppercase tracking-wide font-medium">
              People
            </div>
            <div className="font-heading text-2xl font-semibold">
              {totals.people}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="card p-4 mb-4 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {rowError && (
        <p className="text-sm text-brand-redText mb-2">{rowError}</p>
      )}

      {logs === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          {active
            ? "No entries match those filters."
            : "Nobody has logged work yet."}
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Date</th>
                <th className="text-left font-semibold px-4 py-2">Person</th>
                <th className="text-left font-semibold px-4 py-2">Project</th>
                <th className="text-left font-semibold px-4 py-2">Task</th>
                <th className="text-right font-semibold px-4 py-2">Hours</th>
                <th className="text-left font-semibold px-4 py-2">Note</th>
                <th className="text-right font-semibold px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {shown.map((l) => (
                <LogRow
                  key={l.id}
                  l={l}
                  mine={l.userId === current?.id}
                  editing={editing === l.id}
                  onToggleEdit={() => {
                    setRowError(null);
                    setEditing((e) => (e === l.id ? null : l.id));
                  }}
                  onDone={() => {
                    setEditing(null);
                    load();
                  }}
                  onError={setRowError}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * One entry. Editable in place, but only by whoever logged it.
 *
 * The controls are absent rather than disabled on other people's rows: a
 * greyed-out pencil invites "why can't I?", and the answer — it isn't
 * yours — is better said by there being nothing there to press.
 */
function LogRow({
  l,
  mine,
  editing,
  onToggleEdit,
  onDone,
  onError,
}: {
  l: TeamLog;
  mine: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [hours, setHours] = useState(String(l.hours));
  const [note, setNote] = useState(l.note);
  const [date, setDate] = useState(l.date);
  const [busy, setBusy] = useState(false);

  async function save() {
    onError(null);
    setBusy(true);
    const res = await fetch(`/api/domain/worklogs/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: Number(hours), note, date }),
    });
    setBusy(false);
    if (!res.ok) {
      onError((await res.json().catch(() => ({}))).error ?? "Couldn't save that.");
      return;
    }
    onDone();
  }

  async function remove() {
    onError(null);
    const res = await fetch(`/api/domain/worklogs/${l.id}`, { method: "DELETE" });
    if (!res.ok) {
      onError((await res.json().catch(() => ({}))).error ?? "Couldn't delete that.");
      return;
    }
    onDone();
  }

  if (editing) {
    return (
      <tr className="bg-brand-blueBg/40">
        <td className="px-4 py-2">
          <DateInput value={date} onChange={(iso: string) => setDate(iso)} className={dateClass("sm", "w-36")} />
        </td>
        <td className="px-4 py-2 text-ink-900">{l.user}</td>
        <td className="px-4 py-2 text-ink-500">{l.project ?? "—"}</td>
        <td className="px-4 py-2 text-ink-500">{l.task ?? "—"}</td>
        <td className="px-4 py-2 text-right">
          <input
            type="number"
            step="0.25"
            min="0"
            max="14"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className={inputClass("sm", "w-20 text-right")}
          />
        </td>
        <td className="px-4 py-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass("sm", "w-full")}
          />
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button
            onClick={save}
            disabled={busy || !note.trim() || !hours}
            className="text-xs px-2 py-1 rounded bg-brand-blue text-white disabled:opacity-50"
          >
            {busy ? "…" : "Save"}
          </button>
          <button
            onClick={onToggleEdit}
            title="Cancel"
            className="text-xs px-1.5 py-1 ml-1 rounded text-ink-500 hover:bg-ink-100 align-middle"
          >
            <X size={13} />
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={mine ? "bg-brand-blueBg/20" : ""}>
      <td className="px-4 py-2 text-ink-700 whitespace-nowrap">{fmt(l.date)}</td>
      <td className="px-4 py-2">
        <div className="text-ink-900">
          {l.user}
          {mine && <span className="text-xs text-brand-blue ml-1.5">(you)</span>}
        </div>
        <div className="text-xs text-ink-500">
          {DOMAIN_ROLE_LABELS[l.userRole] ?? l.userRole}
        </div>
      </td>
      <td className="px-4 py-2 text-ink-700">{l.project ?? "—"}</td>
      <td className="px-4 py-2 text-ink-500">{l.task ?? "—"}</td>
      <td className="px-4 py-2 text-right font-medium text-ink-900">{l.hours}</td>
      <td className="px-4 py-2 text-ink-600">{l.note}</td>
      <td className="px-4 py-2 text-right whitespace-nowrap">
        {mine && (
          <>
            <button
              onClick={onToggleEdit}
              title="Edit your entry"
              className="p-1 rounded text-ink-400 hover:text-brand-blue hover:bg-brand-blueBg align-middle"
            >
              <Pencil size={13} />
            </button>
            <ConfirmButton
              onConfirm={remove}
              title="Delete your entry"
              className="p-1 ml-1 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg align-middle"
            >
              <Trash2 size={13} />
            </ConfirmButton>
          </>
        )}
      </td>
    </tr>
  );
}
