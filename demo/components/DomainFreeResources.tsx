"use client";

import { useState } from "react";
import { CheckCircle2, UserMinus } from "lucide-react";

/**
 * "This project is finished — shall I let the team go?"
 *
 * A project stops needing people the day its last tag is delivered, but
 * the bookings run to whatever end date somebody typed weeks earlier. So
 * the team stays Allocated on work that no longer exists, Resource
 * availability under-reports who is free, and the forecast keeps dividing
 * their rate across a project that is asking nothing of them.
 *
 * Nobody remembers to go and end four bookings by hand, so the project
 * says so at the moment it becomes true, on the screen you are already
 * looking at, with the action attached.
 *
 * Deliberately a prompt and not automatic. A delivered project is not
 * always a closed one — a client can come back with the last batch a week
 * later — and quietly releasing a team is not a thing to do on somebody's
 * behalf.
 */
export function DomainFreeResources({
  projectId,
  bookings,
  canManage,
  onDone,
}: {
  projectId: number;
  /** Bookings still open on the finished project. */
  bookings: number;
  /** Admins and Leads own allocation; everyone else just sees the note. */
  canManage: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (bookings === 0 && !result) return null;

  async function free() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/domain/projects/${projectId}/free-resources`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't free them up.");
      return;
    }
    const names: string[] = body.freeNow ?? [];
    setResult(
      `Released ${body.released} booking${body.released === 1 ? "" : "s"}.` +
        (names.length > 0
          ? ` ${names.join(", ")} ${names.length === 1 ? "is" : "are"} free now.`
          : "") +
        (body.stillBusy > 0
          ? ` ${body.stillBusy} still ${body.stillBusy === 1 ? "has" : "have"} work on other projects.`
          : ""),
    );
    onDone();
  }

  if (result) {
    return (
      <div className="card p-4 mb-5 border-l-4 border-brand-green">
        <p className="text-sm text-brand-greenText flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>
            {result}{" "}
            <span className="text-ink-600">
              Everything they delivered here stays on the project, and their
              submissions stay in Approvals.
            </span>
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4 mb-5 border-l-4 border-brand-green">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-ink-900 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-brand-greenText" />
            This project is delivered
          </h3>
          <p className="text-sm text-ink-600 mt-1">
            {bookings} {bookings === 1 ? "person is" : "people are"} still
            booked on it, so they count as busy and the forecast still splits
            their day across it.{" "}
            {canManage
              ? "Free them up and they go back to the pool."
              : "A Lead or an Admin can free them up."}
          </p>
          <p className="text-xs text-ink-500 mt-1">
            Their tags, delivered counts and submissions all stay exactly where
            they are — only the bookings end.
          </p>
        </div>
        {canManage && (
          <button
            onClick={free}
            disabled={busy}
            className="btn-primary text-sm shrink-0 disabled:opacity-50"
          >
            <UserMinus size={14} className="mr-1.5" />
            {busy ? "Freeing…" : `Free up ${bookings}`}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-brand-redText mt-2">{error}</p>}
    </div>
  );
}
