"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import { fmtWeekday as fmt } from "@/lib/domain-format";
import { dateClass } from "@/lib/domain-ui";

/**
 * The team's work log, for the people entitled to read it.
 *
 * Visibility follows the reporting line: an Admin reads everyone, a Lead
 * reads Team Leads and below, a Team Lead reads SMEs and Actionees. Nobody
 * reads the people above them, and nobody sees their own entries here.
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


const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export function DomainTeamLogs() {
  const [logs, setLogs] = useState<TeamLog[] | null>(null);
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

  const totals = useMemo(() => {
    const rows = logs ?? [];
    return {
      hours: Math.round(rows.reduce((s, l) => s + l.hours, 0) * 100) / 100,
      entries: rows.length,
      people: new Set(rows.map((l) => l.userId)).size,
    };
  }, [logs]);

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
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className={dateClass("md")}
            />
          </label>
          <label className="text-sm">
            <span className="block text-ink-700 mb-1">To</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className={dateClass("md")}
            />
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

      {logs === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : logs.length === 0 ? (
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
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-ink-700 whitespace-nowrap">
                    {fmt(l.date)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-ink-900">{l.user}</div>
                    <div className="text-xs text-ink-500">
                      {DOMAIN_ROLE_LABELS[l.userRole] ?? l.userRole}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-ink-700">{l.project ?? "—"}</td>
                  <td className="px-4 py-2 text-ink-500">{l.task ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-medium text-ink-900">
                    {l.hours}
                  </td>
                  <td className="px-4 py-2 text-ink-600">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
