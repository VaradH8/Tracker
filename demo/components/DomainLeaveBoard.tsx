"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, History, Plus, X } from "lucide-react";
import { fmtDate } from "@/lib/domain-format";
import { dateClass, selectClass } from "@/lib/domain-ui";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import {
  approverLabel,
  LEAVE_KINDS,
  REQUESTABLE_KINDS,
  MAX_HALF_DAY_HOURS,
  type LeaveKind,
} from "@/lib/domain-leave";
import { DateInput } from "@/components/DateInput";

/**
 * Attendance and time off.
 *
 * Three things: the requests waiting on you to decide, the form to file
 * one, and the register itself. A supervisor opens this to clear their
 * queue; an SME or Actionee opens it to ask for a day and to see what
 * happened to the last one.
 *
 * The form offers only what the caller may actually file. A worker never
 * sees "Present" as an option, because the server would refuse it and an
 * option that always fails is worse than no option.
 */

type Leave = {
  id: number;
  date: string;
  kind: string;
  hours: number | null;
  note: string | null;
  status: string;
  userId: string;
  userName: string;
  userRole: string;
  createdById: string;
  createdByName: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Decided by the server, not guessed here — see the leaves route. */
  canDecide: boolean;
  /** Which roles a still-pending row is sitting with. */
  awaitingRoles: string[];
};

type Payload = {
  leaves: Leave[];
  canMark: boolean;
  me: { id: string; name: string; role: string };
  people: { id: string; name: string; role: string }[];
  pendingCount: number;
};

const KIND_TONE: Record<string, string> = {
  Present: "bg-brand-greenBg text-brand-greenText",
  Absent: "bg-brand-redBg text-brand-redText",
  "Half day": "bg-brand-yellowBg text-brand-yellowText",
  Leave: "bg-brand-blueBg text-brand-blue",
};

const STATUS_TONE: Record<string, string> = {
  Approved: "bg-brand-greenBg text-brand-greenText",
  Pending: "bg-brand-yellowBg text-brand-yellowText",
  Rejected: "bg-brand-redBg text-brand-redText",
};

/** "Admin", "Team Lead or Lead" — who a pending row is waiting on. */
function awaitingLabel(roles: string[]): string {
  const names = roles.map((r) => DOMAIN_ROLE_LABELS[r as DomainRole] ?? r);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DomainLeaveBoard({
  onReady,
}: { onReady?: (reload: () => Promise<unknown>) => void } = {}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The form.
  const [who, setWho] = useState("");
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState<LeaveKind>("Leave");
  const [hours, setHours] = useState("4");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    return fetch("/api/domain/leaves", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load the register.");
        return r.json();
      })
      .then((b: Payload) => {
        setData(b);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onReady?.(load);
    // onReady is an inline function in the parent; depending on it would
    // re-register on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const canMark = data?.canMark ?? false;
  // Filing for yourself is a request even when you supervise others —
  // nobody approves their own day.
  const forSelf = !canMark || who === "" || who === data?.me.id;
  const myApprover = data
    ? approverLabel(data.me.role as DomainRole)
    : "your lead";
  const offered: readonly LeaveKind[] = forSelf ? REQUESTABLE_KINDS : LEAVE_KINDS;

  // Keep the picked kind legal when switching between self and someone else.
  useEffect(() => {
    if (!offered.includes(kind)) setKind(offered[0]);
  }, [offered, kind]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/domain/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: canMark && who ? who : undefined,
        date,
        kind,
        hours: kind === "Half day" ? Number(hours) : null,
        note,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that.");
      return;
    }
    setNote("");
    setError(null);
    await load();
  }

  async function decide(row: Leave, status: "Approved" | "Rejected") {
    setBusy(true);
    const res = await fetch(`/api/domain/leaves/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't record that.");
      return;
    }
    await load();
  }

  const rows = data?.leaves ?? [];
  const mine = data?.me.id;
  /**
   * Waiting on this person specifically. Not their own request, and not
   * one the routing sends elsewhere — a Lead's own leave goes to an
   * Admin, so it must not sit in a queue the Lead cannot clear.
   */
  const awaitingMe = rows.filter((r) => r.status === "Pending" && r.canDecide);

  return (
    <div className="grid gap-6">
      {error && (
        <p className="text-sm text-brand-redText border-l-4 border-brand-red pl-3 py-1">
          {error}
        </p>
      )}

      {/* --- waiting on you ------------------------------------------ */}
      {canMark && awaitingMe.length > 0 && (
        <section className="card p-5 border-l-4 border-brand-yellow">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2 mb-1">
            <Clock size={17} className="text-brand-yellowText" />
            Waiting on you
          </h2>
          <p className="text-sm text-ink-500 mb-4">
            {awaitingMe.length} request{awaitingMe.length === 1 ? "" : "s"} to
            approve or send back.
          </p>
          <ul className="divide-y divide-ink-100">
            {awaitingMe.map((r) => (
              <li key={r.id} className="py-3 flex items-center gap-3 flex-wrap">
                <span className="font-medium text-ink-900 min-w-[130px]">
                  {r.userName}
                </span>
                <span className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold ${KIND_TONE[r.kind] ?? ""}`}>
                  {r.kind}
                  {r.hours != null && ` · ${r.hours}h`}
                </span>
                <span className="text-sm text-ink-600">{fmtDate(r.date)}</span>
                {r.note && (
                  <span className="text-xs text-ink-500 italic truncate max-w-[240px]">
                    “{r.note}”
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => decide(r, "Approved")}
                    disabled={busy}
                    className="btn-primary text-xs"
                  >
                    <Check size={13} className="mr-1" /> Approve
                  </button>
                  <button
                    onClick={() => decide(r, "Rejected")}
                    disabled={busy}
                    className="btn-ghost text-xs"
                  >
                    <X size={13} className="mr-1" /> Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- file one ------------------------------------------------ */}
      <section className="card p-5">
        <h2 className="font-heading text-lg font-semibold mb-1">
          {canMark ? "Mark attendance" : "Request time off"}
        </h2>
        <p className="text-sm text-ink-500 mb-4">
          {/* Naming the approver is the whole point of the line. A Lead
              who is told "your team lead decides it" goes looking for a
              team lead they do not have. */}
          {canMark
            ? `Record someone as present, absent, or on a half day. Your own days go through as a request — ${myApprover} decides them.`
            : `Ask for a half day or a leave. ${myApprover[0].toUpperCase()}${myApprover.slice(1)} decides it.`}
        </p>

        <form onSubmit={submit} className="flex items-end gap-3 flex-wrap">
          {canMark && (
            <label className="text-xs">
              <span className="block text-ink-700 mb-1">Who</span>
              <select
                value={who}
                onChange={(e) => setWho(e.target.value)}
                className={selectClass("sm", "min-w-[160px]")}
              >
                <option value="">Myself ({data?.me.name})</option>
                {(data?.people ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs">
            <span className="block text-ink-700 mb-1">Date</span>
            <DateInput value={date} onChange={(iso: string) => setDate(iso)} className={dateClass("sm")} />
          </label>

          <label className="text-xs">
            <span className="block text-ink-700 mb-1">What</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as LeaveKind)}
              className={selectClass("sm", "min-w-[120px]")}
            >
              {offered.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          {/* Only a half day carries hours — the one kind where "how much
              of the day" is a real question. */}
          {kind === "Half day" && (
            <label className="text-xs">
              <span className="block text-ink-700 mb-1">Hours worked</span>
              <input
                type="number"
                step={0.25}
                min={0.25}
                max={MAX_HALF_DAY_HOURS}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-24 px-2.5 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </label>
          )}

          <label className="text-xs flex-1 min-w-[180px]">
            <span className="block text-ink-700 mb-1">Reason (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={forSelf ? "e.g. family function" : "e.g. site visit"}
              className="w-full px-2.5 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </label>

          <button type="submit" disabled={!date || busy} className="btn-primary text-xs">
            <Plus size={14} className="mr-1" />
            {forSelf ? "Request" : "Mark"}
          </button>
        </form>
      </section>

      <LeaveHistory rows={rows} meId={mine} canMark={canMark} />
    </div>
  );
}

/**
 * The register.
 *
 * Everything the caller may see, decided or not: their own days, and — for
 * a supervisor — the days of everyone they cover. Absences a lead marked
 * on somebody else's behalf land here too, which is the only place the
 * person marked absent ever finds out.
 *
 * Deliberately one list rather than "approved" and "pending" tabs. The
 * question people actually arrive with is "what happened to Tuesday", and
 * splitting the answer across two tabs means checking both.
 */
function LeaveHistory({
  rows,
  meId,
  canMark,
}: {
  rows: Leave[];
  meId: string | undefined;
  canMark: boolean;
}) {
  const [status, setStatus] = useState<
    "all" | "Pending" | "Approved" | "Rejected"
  >("all");
  const [person, setPerson] = useState("all");

  // Only worth offering when there is more than one person in the list.
  const people = Array.from(
    new Map(rows.map((r) => [r.userId, r.userName])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const shown = rows.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (person === "all" || r.userId === person),
  );

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <History size={17} className="text-ink-400" />
            {canMark ? "Attendance history" : "Your history"}
          </h2>
          <p className="text-sm text-ink-500 mt-0.5">
            {canMark
              ? "Every day marked or requested by the people you cover, and your own."
              : "Every day you have asked for, and where it got to."}
          </p>
        </div>
        <div className="flex items-end gap-2">
          {people.length > 1 && (
            <label className="text-xs">
              <span className="block text-ink-700 mb-1">Person</span>
              <select
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                className={selectClass("sm", "min-w-[150px]")}
              >
                <option value="all">Everyone</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs">
            <span className="block text-ink-700 mb-1">Status</span>
            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target.value as "all" | "Pending" | "Approved" | "Rejected",
                )
              }
              className={selectClass("sm", "min-w-[120px]")}
            >
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          {rows.length === 0
            ? "Nothing on the register yet."
            : "Nothing matches those filters."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Date</th>
                {canMark && (
                  <th className="text-left font-semibold px-3 py-2">Person</th>
                )}
                <th className="text-left font-semibold px-3 py-2">What</th>
                <th className="text-left font-semibold px-3 py-2">Status</th>
                <th className="text-left font-semibold px-3 py-2">Raised by</th>
                <th className="text-left font-semibold px-3 py-2">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {shown.map((r) => (
                <tr
                  key={r.id}
                  // Only worth tinting when there is somebody else in the
                  // table to tell your own rows apart from.
                  className={
                    canMark && r.userId === meId ? "bg-brand-blueBg/30" : ""
                  }
                >
                  <td className="px-3 py-2 whitespace-nowrap text-ink-700">
                    {fmtDate(r.date)}
                  </td>
                  {canMark && (
                    <td className="px-3 py-2">
                      <div className="text-ink-900 font-medium">
                        {r.userName}
                        {r.userId === meId && (
                          <span className="text-ink-400 font-normal"> (you)</span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500">
                        {DOMAIN_ROLE_LABELS[r.userRole as DomainRole] ??
                          r.userRole}
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold ${KIND_TONE[r.kind] ?? ""}`}
                    >
                      {r.kind}
                      {r.hours != null && ` · ${r.hours}h`}
                    </span>
                    {r.note && (
                      <div className="text-xs text-ink-500 italic mt-1 max-w-[220px] truncate">
                        &ldquo;{r.note}&rdquo;
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold ${STATUS_TONE[r.status] ?? ""}`}
                    >
                      {r.status}
                    </span>
                    {/* A pending row is only useful if it says who it is
                        with — otherwise "Pending" reads as "lost". */}
                    {r.status === "Pending" && r.awaitingRoles.length > 0 && (
                      <div className="text-[11px] text-ink-500 mt-1">
                        with {awaitingLabel(r.awaitingRoles)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-600">
                    {/* Filed by somebody else means it was marked, not
                        requested — which is how an absence reaches the
                        person it belongs to. */}
                    {r.createdById === r.userId
                      ? "Requested"
                      : `Marked by ${r.createdByName}`}
                  </td>
                  <td className="px-3 py-2 text-ink-600">
                    {r.decidedByName ? (
                      <>
                        <div>
                          {r.status === "Rejected" ? "Declined" : "Approved"} by{" "}
                          {r.decidedByName}
                        </div>
                        {r.decidedAt && (
                          <div className="text-xs text-ink-400">
                            {fmtDate(r.decidedAt.slice(0, 10))}
                          </div>
                        )}
                        {r.decisionNote && (
                          <div className="text-xs text-ink-500 italic">
                            &ldquo;{r.decisionNote}&rdquo;
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-400">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
