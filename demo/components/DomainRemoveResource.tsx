"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2, UserMinus, X } from "lucide-react";

/**
 * Taking somebody off a project: which of the two, and what it costs.
 *
 * The two actions look similar and are not:
 *
 *   Remove — they leave, the record stays. Reversible in the sense that
 *            matters: nothing is destroyed, so a mistake costs a
 *            reassignment rather than a reconstruction.
 *   Delete — the tag work is destroyed on both sides, Approvals included.
 *            Admin only, and there is no undo.
 *
 * Which is why this is a dialog and not two icons in a row. It reads the
 * real figures first and states them — "3 batches, 4,857 tags, 4,857 of
 * them delivered, 26 submissions" — because a confirmation that cannot say
 * what it is confirming is a speed bump, not a safeguard. Delete is only
 * armed once those figures are on screen and the second button is pressed.
 */

type Impact = {
  assignments: number;
  assignedTags: number;
  deliveredTags: number;
  submissions: number;
  corrections: number;
  tasks: number;
  everAssigned: number;
};

export function DomainRemoveResource({
  projectId,
  person,
  canDelete,
  onClose,
  onDone,
}: {
  projectId: number;
  person: { id: string; name: string };
  /** Admins only — mirrors the route, which refuses `mode=delete` for
   *  everyone else whatever the browser sends. */
  canDelete: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Delete takes two presses, and the second only exists after the first. */
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    fetch(
      `/api/domain/tag-assignments/impact?projectId=${projectId}&assigneeId=${encodeURIComponent(person.id)}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't read what they hold here."))))
      .then((b) => setImpact(b.impact))
      .catch((e: Error) => setError(e.message));
  }, [projectId, person.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(mode: "remove" | "delete") {
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/domain/tag-assignments?projectId=${projectId}&assigneeId=${encodeURIComponent(person.id)}&mode=${mode}` +
        (mode === "delete" ? "&confirm=true" : ""),
      { method: "DELETE" },
    );
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't do that.");
      return;
    }
    const r = body.removed ?? {};
    onDone(
      mode === "delete"
        ? `Deleted ${person.name} from this project — ${r.assignedTags ?? 0} tags and ${r.submissions ?? 0} submissions erased.`
        : `${person.name} is off this project. ${r.assignedTags ?? 0} tags came off its totals; their submissions stay in Approvals.`,
    );
  }

  const nothing =
    impact !== null &&
    impact.everAssigned === 0 &&
    impact.tasks === 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 px-4">
      <div className="card p-6 w-full max-w-lg">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-heading text-lg font-semibold text-ink-900">
            Take {person.name} off this project
          </h2>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {error && <p className="text-sm text-brand-redText mb-3">{error}</p>}

        {impact === null ? (
          <p className="text-sm text-ink-500">Reading what they hold here…</p>
        ) : (
          <>
            <div className="rounded-card border border-ink-200 bg-ink-50 px-4 py-3 my-4 text-sm">
              {nothing ? (
                <p className="text-ink-500 italic">
                  They hold nothing on this project.
                </p>
              ) : (
                <ul className="space-y-1 text-ink-700">
                  <li>
                    <strong className="tabular-nums">{impact.assignedTags}</strong>{" "}
                    tags across{" "}
                    <strong className="tabular-nums">{impact.assignments}</strong>{" "}
                    {impact.assignments === 1 ? "batch" : "batches"}, of which{" "}
                    <strong className="tabular-nums text-brand-greenText">
                      {impact.deliveredTags}
                    </strong>{" "}
                    delivered
                  </li>
                  <li>
                    <strong className="tabular-nums">{impact.submissions}</strong>{" "}
                    {impact.submissions === 1 ? "submission" : "submissions"} in
                    Approvals
                    {impact.corrections > 0 && (
                      <>
                        {" · "}
                        <strong className="tabular-nums">
                          {impact.corrections}
                        </strong>{" "}
                        manual correction
                        {impact.corrections === 1 ? "" : "s"}
                      </>
                    )}
                  </li>
                  {impact.tasks > 0 && (
                    <li>
                      <strong className="tabular-nums">{impact.tasks}</strong>{" "}
                      {impact.tasks === 1 ? "task" : "tasks"} assigned to them
                      here
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* --- remove ------------------------------------------- */}
            <div className="rounded-card border border-ink-200 p-4">
              <div className="flex items-start gap-2.5">
                <UserMinus size={16} className="mt-0.5 shrink-0 text-brand-blue" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-ink-900">Remove from project</h3>
                  <p className="text-sm text-ink-500 mt-0.5">
                    They come off this project and it comes off their screens.
                    Their {impact.submissions} submission
                    {impact.submissions === 1 ? "" : "s"} stay in Approvals
                    against this project. They go back to Free unless another
                    project holds them.
                  </p>
                </div>
                <button
                  onClick={() => run("remove")}
                  disabled={busy || nothing}
                  className="btn-primary text-sm shrink-0 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* --- delete ------------------------------------------- */}
            {canDelete && (
              <div className="rounded-card border border-brand-red/40 bg-brand-redBg/40 p-4 mt-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    size={16}
                    className="mt-0.5 shrink-0 text-brand-redText"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-brand-redText">
                      Delete from project
                    </h3>
                    <p className="text-sm text-ink-700 mt-0.5">
                      Erases their tag work here for good — every batch, all{" "}
                      {impact.submissions} submission
                      {impact.submissions === 1 ? "" : "s"}, and any manual
                      corrections. It disappears from Approvals and from their
                      own submission history alike, and this project&apos;s
                      delivered total drops by {impact.deliveredTags}.
                      {impact.tasks > 0 &&
                        ` Their ${impact.tasks} task${impact.tasks === 1 ? "" : "s"} here stay on the project, unassigned.`}
                    </p>
                    <p className="text-sm font-medium text-brand-redText mt-1.5">
                      This cannot be undone.
                    </p>
                  </div>
                  {!armed ? (
                    <button
                      onClick={() => setArmed(true)}
                      disabled={busy || nothing}
                      className="btn-ghost text-sm shrink-0 border border-brand-red/50 text-brand-redText disabled:opacity-50"
                    >
                      <Trash2 size={13} className="mr-1.5" /> Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => run("delete")}
                      disabled={busy}
                      className="btn-primary text-sm shrink-0 !bg-brand-red hover:!bg-brand-red/90 disabled:opacity-50"
                    >
                      {busy ? "Deleting…" : "Yes, erase it all"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {!canDelete && (
              <p className="text-xs text-ink-400 mt-3">
                Deleting a resource and their history is an admin&apos;s to do.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
