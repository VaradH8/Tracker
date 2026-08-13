"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { DomainPage, PageHeader } from "@/components/DomainPage";

type Assignment = {
  id: number;
  projectName: string;
  client: string | null;
  divisionName: string | null;
  handoverDate: string | null;
  startDate: string | null;
  targetDate: string | null;
  assignedCount: number;
  deliveredCount: number;
  remainingCount: number;
  pendingCount: number;
};

type Submission = {
  id: number;
  date: string;
  completedCount: number;
  approvedCount: number | null;
  status: string;
  projectName: string;
  divisionName: string | null;
  reviewNote: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function statusCls(s: string): string {
  if (s === "Approved") return "bg-brand-greenBg text-brand-greenText";
  if (s === "Rejected") return "bg-brand-redBg text-brand-redText";
  return "bg-brand-yellowBg text-brand-yellowText";
}

/**
 * The actionee's own view: what they're carrying per project and division,
 * and the end-of-day box for "I finished N today". Submitting queues the
 * count for a Lead — it doesn't move the delivered total on its own.
 */
export default function MyTagsPage() {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/domain/tag-assignments?mine=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { assignments: [] },
      ),
      fetch("/api/domain/tag-submissions?mine=true", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { submissions: [] },
      ),
    ])
      .then(([a, s]) => {
        setAssignments(a.assignments ?? []);
        setSubmissions(s.submissions ?? []);
      })
      .catch(() => setAssignments([]));
  }, []);

  useEffect(load, [load]);

  return (
    <DomainPage width="wide">
      <PageHeader
        title="My tags"
        description="What you're carrying on each project and division. Enter what you finished at the end of the day — your Lead reviews it, and only then does it count as delivered."
      />

      {assignments === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          Nothing assigned to you yet.
        </p>
      ) : (
        <div className="grid gap-3 mb-8">
          {assignments.map((a) => (
            <AssignmentCard key={a.id} a={a} onSubmitted={load} />
          ))}
        </div>
      )}

      <section>
        <h2 className="font-heading text-lg font-semibold mb-3">Recent submissions</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-ink-400 italic">Nothing submitted yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Date</th>
                  <th className="text-left font-semibold px-4 py-2">Project</th>
                  <th className="text-left font-semibold px-4 py-2">Submitted</th>
                  <th className="text-left font-semibold px-4 py-2">Approved</th>
                  <th className="text-left font-semibold px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-ink-700">{fmt(s.date)}</td>
                    <td className="px-4 py-2">
                      <div className="text-ink-900">{s.projectName}</div>
                      {s.divisionName && (
                        <div className="text-xs text-ink-500">{s.divisionName}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-700">{s.completedCount}</td>
                    <td className="px-4 py-2 text-ink-700">
                      {s.approvedCount ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(s.status)}`}
                      >
                        {s.status}
                      </span>
                      {s.reviewNote && (
                        <div className="text-xs text-ink-500 mt-0.5">{s.reviewNote}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DomainPage>
  );
}

function AssignmentCard({ a, onSubmitted }: { a: Assignment; onSubmitted: () => void }) {
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The count just submitted, echoed back so the actionee can see exactly
   *  what went to their Lead rather than an empty box. */
  const [justSubmitted, setJustSubmitted] = useState<number | null>(null);

  // What's left to claim once delivered and already-pending tags are taken off.
  const claimable = Math.max(0, a.assignedCount - a.deliveredCount - a.pendingCount);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/domain/tag-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: a.id,
        completedCount: Number(count),
        note: note || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't submit that.");
      return;
    }
    setJustSubmitted(body.submission?.completedCount ?? Number(count));
    setCount("");
    setNote("");
    onSubmitted();
  }

  const pct = a.assignedCount > 0 ? (a.deliveredCount / a.assignedCount) * 100 : 0;

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-heading font-semibold text-ink-900">{a.projectName}</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {a.client ? `${a.client} · ` : ""}
            {a.divisionName ? `${a.divisionName} division · ` : ""}
            Handover {fmt(a.handoverDate)}
          </p>
          {(a.startDate || a.targetDate) && (
            <p className="text-xs text-ink-500 mt-0.5">
              Your dates: {fmt(a.startDate)} → {fmt(a.targetDate)}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-heading font-semibold text-ink-900">
            {a.deliveredCount} / {a.assignedCount}
          </div>
          <div className="text-xs text-ink-500">delivered</div>
        </div>
      </div>

      <div className="h-1.5 rounded-pill bg-ink-100 overflow-hidden mt-3">
        <div className="h-full bg-brand-green" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs">
        <span className="text-ink-500">{a.remainingCount} remaining</span>
        {a.pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 text-brand-yellowText">
            <Clock size={12} /> {a.pendingCount} awaiting your Lead
          </span>
        )}
      </div>

      {claimable === 0 ? (
        <p className="text-xs text-ink-400 italic mt-3">
          Everything here is delivered or waiting on approval.
        </p>
      ) : (
        <div className="flex items-end gap-2 mt-3 flex-wrap">
          <label className="text-sm">
            <span className="block text-ink-700 mb-1">Completed today</span>
            <input
              type="number"
              min={1}
              max={claimable}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
                setJustSubmitted(null);
              }}
              placeholder={String(Math.min(claimable, 70))}
              className="w-28 border border-ink-200 rounded px-2 py-1.5"
            />
          </label>
          <label className="text-sm flex-1 min-w-[160px]">
            <span className="block text-ink-700 mb-1">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-ink-200 rounded px-2 py-1.5"
            />
          </label>
          <button
            onClick={submit}
            disabled={busy || !count}
            className="btn-primary disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      )}

      {justSubmitted !== null && (
        <p className="text-sm text-brand-greenText mt-2 inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          You submitted <strong>{justSubmitted} tag{justSubmitted === 1 ? "" : "s"}</strong> —
          sent to your Lead for approval.
        </p>
      )}
      {error && <p className="text-sm text-brand-redText mt-2">{error}</p>}
    </article>
  );
}
