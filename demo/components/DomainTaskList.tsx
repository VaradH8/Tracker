"use client";

import { useState } from "react";
import { Check, Send, Trash2, X } from "lucide-react";
import {
  backdateFloorISO,
  istParts,
  normaliseTaskStatus,
  type DomainRole,
} from "@/lib/domain";
import { fmtDate } from "@/lib/domain-format";
import { dateClass, inputClass } from "@/lib/domain-ui";
import { ConfirmButton } from "./ConfirmButton";

/**
 * A task, from all three sides of it.
 *
 * The person who was given it submits a note and the day they did the
 * work. The person who handed it out approves or sends it back. Everyone
 * else just reads it. Which controls appear is decided per row from who is
 * looking, so the same component serves the project board, the Task log
 * and the dashboard rather than three near-copies drifting apart.
 */

export type DomainTask = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  estimatedHours: number | null;
  projectId: number | null;
  projectName: string | null;
  assignee: string | null;
  assigneeId: string | null;
  divisionId?: number | null;
  divisionName?: string | null;
  selfCreated?: boolean;
  createdBy: string;
  createdById?: string;
  createdAt: string;
  submittedOn?: string | null;
  submittedNote?: string | null;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
};

export type Person = { id: string; name: string; role: string };

function statusCls(status: string): string {
  const s = normaliseTaskStatus(status);
  if (s === "Approved") return "bg-brand-greenBg text-brand-greenText";
  if (s === "Submitted") return "bg-brand-yellowBg text-brand-yellowText";
  if (s === "Rejected") return "bg-brand-redBg text-brand-redText";
  return "bg-ink-100 text-ink-600";
}

/** "Rejected" is a hard word for "have another go" — say the softer thing. */
function statusLabel(status: string): string {
  const s = normaliseTaskStatus(status);
  return s === "Rejected" ? "Sent back" : s;
}

export function DomainTaskList({
  tasks,
  canManage,
  people = [],
  hideProject = false,
  viewerId,
  viewerRole,
  onChanged,
}: {
  tasks: DomainTask[];
  /** Managers get reassign + delete controls. */
  canManage: boolean;
  people?: Person[];
  hideProject?: boolean;
  viewerId?: string;
  viewerRole?: DomainRole;
  onChanged: () => void;
}) {
  // Reassignment is as open as the original assignment.
  const assignable = people.filter((p) => p.id !== viewerId);

  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/domain/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onChanged();
    return res;
  }

  async function remove(id: number) {
    const res = await fetch(`/api/domain/tasks/${id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-ink-400 italic py-4 text-center">No tasks yet.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          t={t}
          hideProject={hideProject}
          canManage={canManage}
          assignable={assignable}
          isAssignee={!!viewerId && t.assigneeId === viewerId}
          isAssigner={!!viewerId && t.createdById === viewerId}
          onPatch={patch}
          onRemove={remove}
        />
      ))}
    </ul>
  );
}

function TaskRow({
  t,
  hideProject,
  canManage,
  assignable,
  isAssignee,
  isAssigner,
  onPatch,
  onRemove,
}: {
  t: DomainTask;
  hideProject: boolean;
  canManage: boolean;
  assignable: Person[];
  isAssignee: boolean;
  isAssigner: boolean;
  onPatch: (id: number, body: Record<string, unknown>) => Promise<Response>;
  onRemove: (id: number) => void;
}) {
  const status = normaliseTaskStatus(t.status);
  const todayISO = istParts().dateISO;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isAssignee && (status === "Assigned" || status === "Rejected");
  // Nobody signs off work you gave yourself, so the button says what it
  // actually does.
  const submitLabel = t.selfCreated
    ? "Mark done"
    : status === "Rejected"
      ? "Resubmit"
      : "Submit";
  const canReview = isAssigner && status === "Submitted";

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await onPatch(t.id, body);
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "That didn't work.");
      return;
    }
    setOpen(false);
    setNote("");
    setReviewNote("");
  }

  return (
    <li className="card p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <div className="text-sm font-medium text-ink-900 break-words">
            {t.title}
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            {!hideProject && (
              <span>
                {t.projectName ?? "Ad hoc"}
                {t.divisionName ? ` · ${t.divisionName}` : ""} ·{" "}
              </span>
            )}
            {t.selfCreated ? (
              <span>Picked up by {t.assignee}</span>
            ) : (
              <>
                {t.assignee ? `Assigned to ${t.assignee}` : "Unassigned"}
                <span> · by {t.createdBy}</span>
              </>
            )}
            {t.targetDate && <span> · due {fmtDate(t.targetDate)}</span>}
          </div>
        </div>
        <span
          className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(t.status)}`}
        >
          {statusLabel(t.status)}
        </span>

        {canSubmit && !open && (
          <button onClick={() => setOpen(true)} className="btn-primary text-sm">
            <Send size={13} className="mr-1.5" />
            {submitLabel}
          </button>
        )}
        {canReview && !open && (
          <button onClick={() => setOpen(true)} className="btn-primary text-sm">
            Review
          </button>
        )}

        {canManage && assignable.length > 0 && status !== "Approved" && (
          <select
            value={t.assigneeId ?? ""}
            onChange={(e) => onPatch(t.id, { assigneeId: e.target.value || null })}
            className="text-xs rounded border border-ink-200 px-2 py-1 bg-white max-w-[150px]"
            aria-label="Reassign"
          >
            <option value="">Unassigned</option>
            {assignable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {canManage && (
          <ConfirmButton
            onConfirm={() => onRemove(t.id)}
            title="Delete task"
            className="p-1 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
          >
            <Trash2 size={14} />
          </ConfirmButton>
        )}
      </div>

      {/* What the assignee said, once they've said it. Shown to everyone —
          the assigner needs it to decide, and the assignee needs to see
          what they sent. */}
      {t.submittedNote && (
        <div className="mt-2 text-xs bg-ink-50 border border-ink-200 rounded px-3 py-2">
          <span className="text-ink-500">
            Submitted for {fmtDate(t.submittedOn)}:
          </span>{" "}
          <span className="text-ink-900">{t.submittedNote}</span>
        </div>
      )}
      {t.reviewedAt && status !== "Submitted" && (
        <p
          className={`mt-1 text-xs ${
            status === "Approved" ? "text-brand-greenText" : "text-brand-redText"
          }`}
        >
          {status === "Approved" ? "Approved" : "Sent back"} by {t.reviewedBy}
          {t.reviewNote && <span className="text-ink-600"> — “{t.reviewNote}”</span>}
        </p>
      )}

      {open && canSubmit && (
        <div className="mt-3 border-t border-ink-100 pt-3 grid sm:grid-cols-[1fr_auto] gap-2 items-end">
          <div className="grid sm:grid-cols-[160px_1fr] gap-2">
            <label className="text-xs">
              <span className="block text-ink-700 mb-1 font-medium">
                Date you did it
              </span>
              <input
                type="date"
                value={date}
                min={backdateFloorISO()}
                max={todayISO}
                onChange={(e) => setDate(e.target.value)}
                className={dateClass("sm", "w-full")}
              />
            </label>
            <label className="text-xs">
              <span className="block text-ink-700 mb-1 font-medium">Notes</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What you did"
                className={inputClass("sm", "w-full")}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => send({ action: "submit", note, date })}
              disabled={busy || !note.trim()}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && canReview && (
        <div className="mt-3 border-t border-ink-100 pt-3 flex gap-2 items-end flex-wrap">
          <label className="text-xs flex-1 min-w-[180px]">
            <span className="block text-ink-700 mb-1 font-medium">
              Comment (optional)
            </span>
            <input
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Anything to pass back"
              className={inputClass("sm", "w-full")}
            />
          </label>
          <button
            onClick={() => send({ action: "approve", reviewNote })}
            disabled={busy}
            className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check size={13} /> Approve
          </button>
          <button
            onClick={() => send({ action: "reject", reviewNote })}
            disabled={busy}
            className="btn-ghost text-sm inline-flex items-center gap-1.5 text-brand-redText disabled:opacity-50"
          >
            <X size={13} /> Send back
          </button>
          <button onClick={() => setOpen(false)} className="btn-ghost text-sm">
            Cancel
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-brand-redText">{error}</p>}
    </li>
  );
}
