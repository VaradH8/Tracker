"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/domain-format";
import { dateClass } from "@/lib/domain-ui";

/**
 * The public holiday list every handover date is calculated against.
 *
 * Visible to anyone who can see a project schedule, editable only by
 * Admins and Leads. The first question about a date that moved is which
 * days were counted, and a list nobody can open makes that question
 * unanswerable.
 *
 * One row per date rather than a repeating rule: Indian public holidays
 * follow the lunar calendar, so "the same day every year" would be wrong
 * more often than right.
 */

type Holiday = { id: number; date: string; name: string };

/** Just "Fri". fmtWeekday deliberately returns "Fri 02/10/26", which is
 *  the right label elsewhere but repeats the date column here. */
function weekdayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

export function DomainHolidays({ onChanged }: { onChanged?: () => void } = {}) {
  const [rows, setRows] = useState<Holiday[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return fetch("/api/domain/holidays", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load the holiday list.");
        return r.json();
      })
      .then((b) => {
        setRows(b.holidays ?? []);
        setCanEdit(!!b.canEdit);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/domain/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save it.");
      return;
    }
    setDate("");
    setName("");
    setError(null);
    await load();
    // Any open schedule is now calculated against a different list.
    onChanged?.();
  }

  async function remove(h: Holiday) {
    setBusy(true);
    const res = await fetch(`/api/domain/holidays?id=${h.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't remove that one.");
      return;
    }
    await load();
    onChanged?.();
  }

  // Past holidays can't change a future handover date, so the list leads
  // with the ones that still matter.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((h) => h.date >= today);
  const past = rows.filter((h) => h.date < today);

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <CalendarOff size={17} className="text-brand-blue" />
            Public holidays
          </h2>
          <p className="text-sm text-ink-500 mt-0.5">
            Days nobody works, on top of the weekend. Every handover date
            calculated from working days skips these.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-brand-redText border-l-4 border-brand-red pl-3 py-1 mb-3">
          {error}
        </p>
      )}

      {canEdit && (
        <form onSubmit={add} className="flex items-end gap-2 flex-wrap mb-4">
          <label className="text-xs">
            <span className="block text-ink-700 mb-1">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={dateClass("sm")}
            />
          </label>
          <label className="text-xs flex-1 min-w-[180px]">
            <span className="block text-ink-700 mb-1">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali"
              maxLength={80}
              className="w-full px-2.5 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </label>
          <button
            type="submit"
            disabled={!date || !name.trim() || busy}
            className="btn-primary text-xs"
          >
            <Plus size={14} className="mr-1" /> Add
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          No holidays added yet — handover dates currently skip weekends only.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <HolidayList
            title={`Upcoming (${upcoming.length})`}
            rows={upcoming}
            canEdit={canEdit}
            busy={busy}
            onRemove={remove}
            empty="Nothing left this year."
          />
          <HolidayList
            title={`Past (${past.length})`}
            rows={past}
            canEdit={canEdit}
            busy={busy}
            onRemove={remove}
            empty="None yet."
            muted
          />
        </div>
      )}
    </section>
  );
}

function HolidayList({
  title,
  rows,
  canEdit,
  busy,
  onRemove,
  empty,
  muted = false,
}: {
  title: string;
  rows: Holiday[];
  canEdit: boolean;
  busy: boolean;
  onRemove: (h: Holiday) => void;
  empty: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-400 italic">{empty}</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-1.5">
              <span
                className={`text-xs font-medium tabular-nums shrink-0 ${
                  muted ? "text-ink-400" : "text-ink-700"
                }`}
              >
                {fmtDate(h.date)}
              </span>
              <span className="text-[11px] text-ink-400 shrink-0 w-7">
                {weekdayOf(h.date)}
              </span>
              <span
                className={`text-sm truncate ${muted ? "text-ink-400" : "text-ink-900"}`}
              >
                {h.name}
              </span>
              {canEdit && (
                <button
                  onClick={() => onRemove(h)}
                  disabled={busy}
                  className="ml-auto p-1 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg shrink-0"
                  aria-label={`Remove ${h.name}`}
                  title="Remove"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
