"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Plus, X } from "lucide-react";
import { fmtDate } from "@/lib/domain-format";
import { dateClass, selectClass } from "@/lib/domain-ui";
import {
  LEAVE_KINDS,
  REQUESTABLE_KINDS,
  MAX_HALF_DAY_HOURS,
  type LeaveKind,
} from "@/lib/domain-leave";
import { DateInput } from "@/components/DateInput";

/**
 * Attendance and time off.
 *
 * Two things only: the requests waiting on you to decide, and the form to
 * file one. A supervisor opens this to clear their queue; an SME or
 * Actionee opens it to ask for a day.
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
  // Waiting on this person specifically — not their own pending request,
  // which they cannot decide.
  const awaitingMe = rows.filter((r) => r.status === "Pending" && r.userId !== mine);

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
          {canMark
            ? "Record someone as present, absent, or on a half day. Your own days go through as a request — nobody approves their own."
            : "Ask for a half day or a leave. Your team lead decides it."}
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

    </div>
  );
}
