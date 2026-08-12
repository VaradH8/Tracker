"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";

type Submission = {
  id: number;
  date: string;
  completedCount: number;
  status: string;
  note: string | null;
  projectName: string;
  divisionName: string | null;
  assigneeName: string;
  assignedCount: number;
  deliveredCount: number;
  submittedBy: string;
};

function fmt(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The Lead's review queue. Approving is what turns a claimed count into
 * delivered tags — and the forecast follows immediately.
 */
export default function ApprovalsPage() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/domain/tag-submissions?status=Pending", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) throw new Error("Approvals are for Leads and Admins.");
        return r.json();
      })
      .then((b) => {
        setRows(b.submissions ?? []);
        setError(null);
      })
      .catch((e: Error) => {
        setRows([]);
        setError(e.message);
      });
  }, []);

  useEffect(load, [load]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Tag approvals</h1>
        <p className="text-sm text-ink-500 mt-1">
          Completion counts submitted by the team, waiting on you. Approving
          adds them to the project&apos;s delivered total and updates the
          forecast; you can approve fewer than were claimed.
        </p>
      </header>

      {error && (
        <div className="card p-4 mb-6 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {rows === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-400 italic">Nothing waiting for review.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map((s) => (
            <ReviewCard key={s.id} s={s} onReviewed={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ s, onReviewed }: { s: Submission; onReviewed: () => void }) {
  const [approved, setApproved] = useState(String(s.completedCount));
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/domain/tag-submissions/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        approvedCount: action === "approve" ? Number(approved) : undefined,
        reviewNote: reviewNote || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't record that.");
      return;
    }
    onReviewed();
  }

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-heading font-semibold text-ink-900">
            {s.assigneeName}
            <span className="font-sans font-normal text-sm text-ink-500">
              {" "}
              claims {s.completedCount} tags
            </span>
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {s.projectName}
            {s.divisionName ? ` · ${s.divisionName}` : ""} · {fmt(s.date)} ·{" "}
            {s.deliveredCount}/{s.assignedCount} delivered so far
            {s.submittedBy !== s.assigneeName && ` · filed by ${s.submittedBy}`}
          </p>
          {s.note && <p className="text-sm text-ink-700 mt-1">“{s.note}”</p>}
        </div>
      </div>

      <div className="flex items-end gap-2 mt-3 flex-wrap">
        <label className="text-sm">
          <span className="block text-ink-700 mb-1">Approve count</span>
          <input
            type="number"
            min={0}
            max={s.completedCount}
            value={approved}
            onChange={(e) => setApproved(e.target.value)}
            className="w-24 border border-ink-200 rounded px-2 py-1.5"
          />
        </label>
        <label className="text-sm flex-1 min-w-[160px]">
          <span className="block text-ink-700 mb-1">Note (optional)</span>
          <input
            type="text"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            className="w-full border border-ink-200 rounded px-2 py-1.5"
          />
        </label>
        <button
          onClick={() => review("approve")}
          disabled={busy}
          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Check size={14} /> Approve
        </button>
        <button
          onClick={() => review("reject")}
          disabled={busy}
          className="btn-ghost inline-flex items-center gap-1.5 text-brand-redText disabled:opacity-50"
        >
          <X size={14} /> Reject
        </button>
      </div>

      {error && <p className="text-sm text-brand-redText mt-2">{error}</p>}
    </article>
  );
}
