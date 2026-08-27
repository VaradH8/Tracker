"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { fmtDate, fmtEditedStamp } from "@/lib/domain-format";
import { dateClass, inputClass, textareaClass } from "@/lib/domain-ui";
import { DateInput } from "@/components/DateInput";
import { budgetedHours, hoursVariance } from "@/lib/domain-task-hours";

/**
 * One task, in full, for whoever is looking at it.
 *
 * Two screens need the same thing — the person doing the work and the
 * person checking it both need the brief, the dates, the files and who
 * else is involved. Only the action at the bottom differs, so the card is
 * shared and the action is a prop.
 *
 * Reviewers are always listed in full, never as a count. Any one of them
 * approving closes a task, so "3 reviewers" on a closed one would read as
 * three opinions when it was one; the names and their decisions are the
 * only honest way to show it.
 */

export type TaskCardTask = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  projectName: string | null;
  divisionName: string | null;
  assignee: string | null;
  assigneeId: string | null;
  createdBy: string;
  createdById: string;
  startDate: string | null;
  targetDate: string | null;
  estimatedHours: number | null;
  hoursSpent?: number | null;
  submittedOn: string | null;
  submittedNote: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  editedAt?: string | null;
  editedBy?: string | null;
  selfCreated?: boolean;
  reviewers?: {
    id: string;
    name: string;
    role: string;
    decision: string;
    decidedAt: string | null;
    note: string | null;
  }[];
  attachments?: {
    id: number;
    side: string;
    name: string;
    size: string;
    kind: string;
    uploadedBy: string | null;
  }[];
};

const STATUS_TONE: Record<string, string> = {
  Assigned: "bg-brand-blueBg text-brand-blue",
  Submitted: "bg-brand-yellowBg text-brand-yellowText",
  Approved: "bg-brand-greenBg text-brand-greenText",
  Rejected: "bg-brand-redBg text-brand-redText",
};

export function DomainTaskCard({
  t,
  mode,
  viewerId,
  readOnly = false,
  onChanged,
}: {
  t: TaskCardTask;
  /** `do` is the assignee's view; `review` is a reviewer's. */
  mode: "do" | "review";
  /**
   * Show the task, offer nothing.
   *
   * History lists work the viewer may have no part in — something they
   * assigned to somebody else, or a colleague's task caught by a filter.
   * The card is still the right way to read it; the submit box and the
   * approve buttons are not, because the server would refuse them and the
   * only thing on offer would be a 403.
   */
  readOnly?: boolean;
  /** Who is looking. Only the person who wrote a task may rewrite it. */
  viewerId?: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: t.title,
    description: t.description ?? "",
    targetDate: t.targetDate ?? "",
    estimatedHours: t.estimatedHours == null ? "" : String(t.estimatedHours),
  });
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submitting
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // Reviewing
  const [reviewNote, setReviewNote] = useState("");

  const budget = t.estimatedHours ?? budgetedHours(t.startDate, t.targetDate);
  const variance = hoursVariance(budget, t.hoursSpent ?? null);
  const reviewers = t.reviewers ?? [];
  const brief = (t.attachments ?? []).filter((a) => a.side === "Brief");
  const work = (t.attachments ?? []).filter((a) => a.side === "Submission");
  const decided = reviewers.find((r) => r.decision !== "Pending");
  const untouched = decided
    ? reviewers.filter((r) => r.decision === "Pending")
    : [];

  async function act(action: "submit" | "approve" | "reject") {
    setActing(true);
    setError(null);
    const res = await fetch(`/api/domain/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "submit"
          ? { action, note, date, hoursSpent: hours || null }
          : { action, reviewNote: reviewNote || null },
      ),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActing(false);
      setError(body.error ?? "Couldn't do that.");
      return;
    }
    if (action === "submit") {
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("side", "Submission");
        await fetch(`/api/domain/tasks/${t.id}/attachments`, {
          method: "POST",
          body: fd,
        });
      }
    }
    setActing(false);
    setNote("");
    setReviewNote("");
    setFiles([]);
    onChanged();
  }

  const canSubmit = t.status === "Assigned" || t.status === "Rejected";
  /**
   * The person who wrote it may rewrite it, until it is signed off.
   *
   * Not after: an approved task is the record of what was asked and what
   * came back, and editing the question afterwards would leave an
   * approval sitting under something nobody agreed to.
   */
  const isCreator = !!viewerId && t.createdById === viewerId;
  const isAssignee = !!viewerId && t.assigneeId === viewerId;
  const canEdit = isCreator && t.status !== "Approved";

  async function saveEdit() {
    setActing(true);
    setError(null);
    const res = await fetch(`/api/domain/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        description: draft.description || null,
        targetDate: draft.targetDate || null,
        estimatedHours: draft.estimatedHours || null,
      }),
    });
    const b = await res.json().catch(() => ({}));
    setActing(false);
    if (!res.ok) {
      setError(b.error ?? "Couldn't save that.");
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function remove() {
    setActing(true);
    setError(null);
    const res = await fetch(`/api/domain/tasks/${t.id}`, { method: "DELETE" });
    setActing(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Couldn't delete that.");
      return;
    }
    onChanged();
  }

  return (
    <article className="card p-4">
      {/* ---- headline --------------------------------------------- */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-start gap-1.5 text-left min-w-0 group"
        >
          <ChevronRight
            size={15}
            className={`mt-0.5 shrink-0 text-ink-400 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0">
            <span className="block font-medium text-ink-900 group-hover:text-brand-blue">
              {t.title}
            </span>
            <span className="block text-xs text-ink-500 mt-0.5">
              {t.projectName ?? "Ad hoc"}
              {t.divisionName ? ` · ${t.divisionName}` : ""}
              {/* Direction, in one word, without opening the card. A bare
                  name reads as "somebody involved" and leaves you to guess
                  which end of the task they are. */}
              {mode === "review" ? (
                <> · to {t.assignee}</>
              ) : (
                <> · from {t.selfCreated ? "yourself" : t.createdBy}</>
              )}
              {t.targetDate && <> · due {fmtDate(t.targetDate)}</>}
            </span>
          </span>
        </button>
        <span className="flex items-center gap-1.5 shrink-0">
          {/*
            The brief changed after it went out.

            Small and quiet, but always there: somebody read this task and
            acted on it, and an edit means what they read is not what they
            were asked for. Hovering gives who did it — the chip itself
            stays short enough to sit beside the status without crowding
            the title.
          */}
          {t.editedAt && (
            <span
              title={t.editedBy ? `Edited by ${t.editedBy}` : undefined}
              className="px-1.5 py-0.5 rounded-pill text-[10px] font-medium bg-ink-100 text-ink-500"
            >
              edited {fmtEditedStamp(t.editedAt)}
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold ${STATUS_TONE[t.status] ?? ""}`}
          >
            {t.status === "Rejected" ? "Sent back" : t.status}
          </span>
        </span>
      </div>

      {/* Sent back is the one state that needs saying without opening. */}
      {t.status === "Rejected" && t.reviewNote && (
        <p className="text-xs text-brand-redText mt-2 border-l-2 border-brand-red pl-2">
          {t.reviewedBy} sent it back: &ldquo;{t.reviewNote}&rdquo;
        </p>
      )}

      {open && editing && (
        <div className="mt-3 pt-3 border-t border-ink-100 grid gap-2">
          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">Task</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className={inputClass("sm", "w-full")}
            />
          </label>
          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">Note</span>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              className={textareaClass("w-full")}
            />
          </label>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-xs">
              <span className="block text-ink-700 font-medium mb-1">Due</span>
              <DateInput
                value={draft.targetDate}
                onChange={(v) => setDraft({ ...draft, targetDate: v })}
                className={dateClass("sm")}
              />
            </label>
            <label className="text-xs">
              <span className="block text-ink-700 font-medium mb-1">Hours</span>
              <input
                type="number"
                min={0}
                step={0.25}
                value={draft.estimatedHours}
                onChange={(e) =>
                  setDraft({ ...draft, estimatedHours: e.target.value })
                }
                className={inputClass("sm", "w-24")}
              />
            </label>
            <button
              onClick={saveEdit}
              disabled={acting || !draft.title.trim()}
              className="btn-primary text-sm ml-auto disabled:opacity-50"
            >
              {acting ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setDraft({
                  title: t.title,
                  description: t.description ?? "",
                  targetDate: t.targetDate ?? "",
                  estimatedHours:
                    t.estimatedHours == null ? "" : String(t.estimatedHours),
                });
              }}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-ink-400">
            {t.assignee} has already been told about this one — the task will
            show that it was edited.
          </p>
          {error && <p className="text-xs text-brand-redText">{error}</p>}
        </div>
      )}

      {open && !editing && (
        <div className="mt-3 pt-3 border-t border-ink-100 grid gap-3">
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="btn-ghost text-xs border border-ink-200"
              >
                <Pencil size={12} className="mr-1.5" /> Edit
              </button>
              <ConfirmButton
                onConfirm={remove}
                title={`Delete "${t.title}"`}
                confirmLabel="Delete for good?"
                className="btn-ghost text-xs border border-ink-200 text-brand-redText"
              >
                <Trash2 size={12} className="mr-1.5" /> Delete
              </ConfirmButton>
              <span className="text-[11px] text-ink-400">
                Yours to change — you assigned it.
              </span>
            </div>
          )}
          {/*
            Who, both ways, always.

            This used to print "From <creator>" and only when there was a
            note to hang it on. On History that was actively wrong — the
            person reading is usually the one who ASSIGNED the task, and
            being told it came "from" themselves answers a question nobody
            asked while hiding the one they had: who is it on?
          */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-ink-500 text-xs">Assigned to </span>
              <span className="text-ink-900 font-medium">
                {isAssignee ? "you" : (t.assignee ?? "nobody")}
              </span>
            </span>
            <span>
              <span className="text-ink-500 text-xs">by </span>
              <span className="text-ink-900 font-medium">
                {isCreator ? "you" : t.createdBy}
              </span>
            </span>
          </div>

          {t.description ? (
            <div className="text-sm">
              <span className="text-ink-500 text-xs">The work</span>
              <p className="text-ink-900 whitespace-pre-wrap mt-0.5">
                {t.description}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-400 italic">
              No note — the title is the whole brief.
            </p>
          )}

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Fact label="Assigned" value={fmtDate(t.startDate)} />
            <Fact label="Due" value={fmtDate(t.targetDate)} />
            <Fact label="Budget" value={budget ? `${budget}h` : "—"} />
            <Fact
              label="Spent"
              value={t.hoursSpent != null ? `${t.hoursSpent}h` : "—"}
              tone={
                variance && variance.by > 0
                  ? variance.over
                    ? "text-brand-redText"
                    : "text-brand-greenText"
                  : undefined
              }
              note={
                variance && variance.by > 0
                  ? `${variance.by}h ${variance.over ? "over" : "under"}`
                  : undefined
              }
            />
          </dl>

          <Files label="Brief" files={brief} taskId={t.id} />

          {/* ---- who signs it off ---------------------------------- */}
          <div className="text-xs">
            <span className="block text-ink-500 mb-1">Reviewers</span>
            {reviewers.length === 0 ? (
              <p className="text-ink-600">
                Nobody — this one is done when it&apos;s submitted.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {reviewers.map((r) => (
                  <li
                    key={r.id}
                    className={`px-2 py-0.5 rounded-pill text-[11px] font-medium ${
                      r.decision === "Approved"
                        ? "bg-brand-greenBg text-brand-greenText"
                        : r.decision === "Rejected"
                          ? "bg-brand-redBg text-brand-redText"
                          : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {r.name}
                    {r.decision !== "Pending" && ` · ${r.decision.toLowerCase()}`}
                  </li>
                ))}
              </ul>
            )}
            {/* The weakness of any-one-approves, said out loud rather than
                left for somebody to assume three people read it. */}
            {untouched.length > 0 && (
              <p className="text-[11px] text-ink-400 mt-1">
                {decided?.name} decided it — {untouched.map((r) => r.name).join(", ")}{" "}
                did not review it.
              </p>
            )}
          </div>

          {/* ---- what came back ------------------------------------ */}
          {t.submittedNote ? (
            <div className="text-sm bg-ink-50 rounded p-3 border-l-2 border-brand-blue">
              <span className="text-ink-500 text-xs">
                {isAssignee ? "You submitted" : `${t.assignee} submitted`} this
                {t.submittedOn ? ` on ${fmtDate(t.submittedOn)}` : ""}
                {t.hoursSpent != null && ` · ${t.hoursSpent}h spent`}
              </span>
              <p className="text-ink-900 whitespace-pre-wrap mt-0.5">
                {t.submittedNote}
              </p>
              <Files label="Work" files={work} taskId={t.id} />
            </div>
          ) : (
            /* The absence is information too: on a task you handed out,
               "nothing back yet" is the thing you opened the card to
               find out, and a blank space does not say it. */
            t.status !== "Approved" && (
              <p className="text-sm text-ink-400 italic">
                {isAssignee
                  ? "You haven't submitted this yet."
                  : `Nothing back from ${t.assignee ?? "them"} yet.`}
              </p>
            )
          )}

          {/* The decision, when there has been one. Kept next to the
              submission it is about rather than at the foot of the card. */}
          {t.reviewedBy && t.status !== "Rejected" && (
            <p className="text-sm text-brand-greenText">
              Approved by {t.reviewedBy}
              {t.reviewNote && `: “${t.reviewNote}”`}
            </p>
          )}

          {/* ---- the action --------------------------------------- */}
          {mode === "do" && canSubmit && !readOnly && (
            <div className="grid gap-2 pt-1">
              <label className="text-xs">
                <span className="block text-ink-700 font-medium mb-1">
                  What you did <span className="text-brand-redText">*</span>
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className={textareaClass("w-full")}
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  <span className="block text-ink-700 font-medium mb-1">
                    Date done
                  </span>
                  <DateInput value={date} onChange={setDate} className={dateClass("sm")} />
                </label>
                <label className="text-xs">
                  <span className="block text-ink-700 font-medium mb-1">
                    Hours taken
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder={budget ? String(budget) : "—"}
                    className={inputClass("sm", "w-24")}
                  />
                </label>
                <label className="btn-ghost text-xs border border-ink-200 cursor-pointer">
                  <Paperclip size={13} className="mr-1.5" />
                  Attach
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) =>
                      setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])
                    }
                  />
                </label>
                <button
                  onClick={() => act("submit")}
                  disabled={acting || !note.trim()}
                  className="btn-primary text-sm ml-auto disabled:opacity-50"
                >
                  <Send size={13} className="mr-1.5" />
                  {acting
                    ? "Submitting…"
                    : reviewers.length === 0
                      ? "Submit — done"
                      : "Submit for review"}
                </button>
              </div>
              {files.length > 0 && (
                <p className="text-[11px] text-ink-500">
                  {files.map((f) => f.name).join(", ")}
                </p>
              )}
            </div>
          )}

          {mode === "review" && t.status === "Submitted" && !readOnly && (
            <div className="grid gap-2 pt-1">
              <label className="text-xs">
                <span className="block text-ink-700 font-medium mb-1">
                  Note <span className="text-ink-400 font-normal">(optional)</span>
                </span>
                <input
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Anything to say to them"
                  className={inputClass("sm", "w-full")}
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => act("approve")}
                  disabled={acting}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  <CheckCircle2 size={13} className="mr-1.5" /> Approve
                </button>
                <button
                  onClick={() => act("reject")}
                  disabled={acting}
                  className="btn-ghost text-sm border border-ink-200 text-brand-redText disabled:opacity-50"
                >
                  <Undo2 size={13} className="mr-1.5" /> Send back
                </button>
                <span className="text-[11px] text-ink-400 ml-auto">
                  {reviewers.length > 1
                    ? "Approving closes it — the others won't be asked."
                    : "Sending it back returns it to be redone."}
                </span>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-brand-redText">{error}</p>}
        </div>
      )}
    </article>
  );
}

function Fact({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: string;
  note?: string;
}) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd className={`font-medium tabular-nums ${tone ?? "text-ink-900"}`}>
        {value}
        {note && <span className="block text-[11px] font-normal">{note}</span>}
      </dd>
    </div>
  );
}

/**
 * Files, downloaded through the API rather than linked at their path.
 *
 * The route checks who is asking before it reads a byte — a storage path
 * in the markup would be a way round that for anybody who noticed it.
 */
function Files({
  label,
  files,
  taskId,
}: {
  label: string;
  files: { id: number; name: string; size: string }[];
  taskId: number;
}) {
  if (files.length === 0) return null;
  return (
    <div className="text-xs mt-2">
      <span className="block text-ink-500 mb-1">{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <li key={f.id}>
            <a
              href={`/api/domain/tasks/${taskId}/attachments/${f.id}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-ink-200 hover:bg-ink-50 text-ink-700"
            >
              <Paperclip size={11} />
              {f.name}
              <span className="text-ink-400">{f.size}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
