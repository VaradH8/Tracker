"use client";

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FolderOpen,
  Hourglass,
  User,
  ExternalLink,
  Eye,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { fmtDate, fmtEditedStamp } from "@/lib/domain-format";
import { dateClass, inputClass, selectClass, textareaClass } from "@/lib/domain-ui";
import { DOMAIN_TASK_PRIORITIES } from "@/lib/domain";
import { DateInput } from "@/components/DateInput";
import { budgetedHours, hoursVariance } from "@/lib/domain-task-hours";
import { isImageName, isViewable } from "@/lib/domain-task-view";

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
  priority?: string | null;
  startDate: string | null;
  targetDate: string | null;
  /** When the task was raised. The fallback for `startDate`, which older
   *  tasks predate — see the closed row. */
  createdAt?: string | null;
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

/** High shouts, Low murmurs, Medium says nothing at all — see the chip. */
const PRIORITY_TONE: Record<string, string> = {
  High: "bg-brand-redBg text-brand-redText",
  Medium: "bg-ink-100 text-ink-600",
  Low: "bg-ink-100 text-ink-500",
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
    priority: t.priority ?? "Medium",
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
  const isCreator = !!viewerId && t.createdById === viewerId;
  const isAssignee = !!viewerId && t.assigneeId === viewerId;

  /**
   * Editing stops at approval; deleting does not.
   *
   * These used to share one gate, which was wrong in a way that only
   * showed up after a task closed: the Delete button vanished the moment
   * somebody approved the work, leaving no way to clear a task you
   * raised in error.
   *
   * They are different acts. Rewriting the brief under an approval leaves
   * a signature sitting beneath something nobody agreed to — the words
   * change and the approval does not, so it now attests to the wrong
   * thing. Deleting takes the whole record away, approval included, and
   * leaves nothing to be misread. The first is quiet falsification; the
   * second is a decision the creator is entitled to make.
   */
  const canEdit = isCreator && t.status !== "Approved";
  const canDelete = isCreator;

  /**
   * Whoever assigned it may sign it off, alongside anyone they named.
   *
   * Naming a reviewer adds people who can close the task; it does not
   * hand the job over and lock the assigner out. The card used to gate
   * these controls on `mode === "review"`, which is about which list you
   * are looking at rather than what you are allowed to do — so an
   * assigner opening their own submitted task from History saw the work
   * and no way to accept it.
   */
  /**
   * Late, or wanted today.
   *
   * Only worth saying while the task is still open — a due date on
   * finished work is history, and colouring it red would have people
   * chasing something that already came back.
   */
  const dueTone = (() => {
    if (!t.targetDate || t.status === "Approved" || t.status === "Submitted") {
      return "";
    }
    const today = new Date().toISOString().slice(0, 10);
    const due = t.targetDate.slice(0, 10);
    // Whole-chip tones, so a late task is visible down a list rather than
    // being one slightly redder word inside a grey pill.
    if (due < today) {
      return "bg-brand-redBg text-brand-redText border-brand-red";
    }
    if (due === today) {
      return "bg-brand-yellowBg text-brand-yellowText border-brand-yellow";
    }
    return "";
  })();

  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  async function addToBrief(picked: File[]) {
    if (picked.length === 0) return;
    setBriefBusy(true);
    setBriefError(null);
    const failed: string[] = [];
    let why: string | null = null;
    for (const f of picked) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("side", "Brief");
      const r = await fetch(`/api/domain/tasks/${t.id}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        failed.push(f.name);
        const b = await r.json().catch(() => ({}));
        if (b?.error) why = b.error;
      }
    }
    setBriefBusy(false);
    setBriefError(
      failed.length === 0 ? null : (why ?? `Couldn't attach ${failed.join(", ")}.`),
    );
    onChanged();
  }

  const canDecideThis =
    t.status === "Submitted" &&
    !!viewerId &&
    (isCreator || reviewers.some((r) => r.id === viewerId));

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
        priority: draft.priority,
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
      {/*
        Title and state on one row; the chips get their own beneath.

        They used to share a wrapping flex, so a task with a full set of
        chips pushed its own status pill onto a second line and left it
        floating under the row it belongs to. State is what you scan a
        list by — it has to stay pinned to the title.
      */}
      <div className="flex items-start justify-between gap-3">
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
          {/*
            Urgency, next to state.

            Medium is left off deliberately. It is the default and most
            tasks carry it, so drawing it on every row would cost the chip
            all its signal — the ones worth noticing are the ones somebody
            moved off the default in either direction.
          */}
          {t.priority && t.priority !== "Medium" && t.status !== "Approved" && (
            <span
              className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold ${PRIORITY_TONE[t.priority] ?? ""}`}
            >
              {t.priority}
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold ${STATUS_TONE[t.status] ?? ""}`}
          >
            {t.status === "Rejected" ? "Sent back" : t.status}
          </span>
        </span>
      </div>

      {/*
        Chips, not a sentence.

        This was a run of words joined by dots, which asked the reader to
        parse a string to find a date. Each fact now has a boundary and an
        icon, so "when is it due" is a shape you land on rather than a
        phrase you read to the end of.

        On their own row, full width: sharing the title's wrapping flex
        meant a task with a full set of chips shoved its own status pill
        onto a second line.

        The due chip is the only one that ever changes colour. It is the
        one fact here that can be bad news.
      */}
      <span className="flex flex-wrap items-center gap-1.5 mt-2 pl-[21px]">
              <Chip icon={<FolderOpen size={11} />}>
                {t.projectName ?? "Ad hoc"}
                {t.divisionName ? ` · ${t.divisionName}` : ""}
              </Chip>

              <Chip icon={<User size={11} />}>
                {mode === "review" ? "to " : "from "}
                {mode === "review"
                  ? (t.assignee ?? "nobody")
                  : t.selfCreated
                    ? "yourself"
                    : t.createdBy}
              </Chip>

              {/* createdAt is a full timestamp and startDate a plain day;
                  fmtDate wants the day, so trim rather than getting an em
                  dash for a date we hold. */}
              <Chip icon={<CalendarDays size={11} />} label="Assigned">
                {fmtDate(t.startDate ?? t.createdAt?.slice(0, 10))}
              </Chip>

              {t.targetDate && (
                <Chip icon={<Clock size={11} />} label="Due" tone={dueTone}>
                  {fmtDate(t.targetDate)}
                </Chip>
              )}

              {budget != null && (
                <Chip icon={<Hourglass size={11} />} label="Budget">
                  {budget}h
                </Chip>
              )}

              {/* Only once there is something to report. An empty "Spent —"
                  chip on every open task is a column of dashes. */}
              {t.hoursSpent != null && (
                <Chip
                  icon={<Hourglass size={11} />}
                  label="Spent"
                  tone={
                    variance && variance.by > 0
                      ? variance.over
                        ? "bg-brand-redBg text-brand-redText border-brand-red"
                        : "bg-brand-greenBg text-brand-greenText border-brand-green"
                      : undefined
                  }
                >
                  {t.hoursSpent}h
                  {variance && variance.by > 0 && (
                    <> ({variance.by}h {variance.over ? "over" : "under"})</>
                  )}
                </Chip>
              )}
      </span>


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
              <span className="block text-ink-700 font-medium mb-1">Priority</span>
              <select
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                className={selectClass("sm")}
              >
                {DOMAIN_TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
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
                  priority: t.priority ?? "Medium",
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
          {(canEdit || canDelete) && (
            <div className="flex items-center gap-2 flex-wrap">
              {canEdit && (
                <button
                  onClick={() => setEditing(true)}
                  className="btn-ghost text-xs border border-ink-200"
                >
                  <Pencil size={12} className="mr-1.5" /> Edit
                </button>
              )}
              {canDelete && (
                <ConfirmButton
                  onConfirm={remove}
                  title={`Delete "${t.title}"`}
                  /* An approved task takes its submission and its sign-off
                     with it, so the second press says so rather than
                     asking the same mild question as an untouched one. */
                  confirmLabel={
                    t.status === "Approved"
                      ? "Delete the record too?"
                      : "Delete for good?"
                  }
                  className="btn-ghost text-xs border border-ink-200 text-brand-redText"
                >
                  <Trash2 size={12} className="mr-1.5" /> Delete
                </ConfirmButton>
              )}
              {/* Only say something when it is not obvious. Two labelled
                  buttons explain themselves; "approved, so no editing"
                  does not. */}
              {!canEdit && (
                <span className="text-[11px] text-ink-500">
                  Approved — the brief is fixed, but it&apos;s yours to remove.
                </span>
              )}
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
          {/*
            One sentence, not two labelled fragments.

            "Assigned to you / by you" sat as two columns and read like a
            form. The self-assigned case gets its own wording, because the
            general phrasing collapses into "You have this, from you" —
            true, and not how anybody would say it.
          */}
          <p className="text-sm text-ink-600">
            {isCreator && isAssignee ? (
              <>
                <span className="text-ink-900 font-medium">You</span> gave
                this to yourself.
              </>
            ) : (
              <>
                <span className="text-ink-900 font-medium">
                  {isAssignee ? "You" : (t.assignee ?? "Nobody")}
                </span>
                {isAssignee ? " have this, from " : " has this, from "}
                <span className="text-ink-900 font-medium">
                  {isCreator ? "you" : t.createdBy}
                </span>
                .
              </>
            )}
          </p>

          {t.description ? (
            <div>
              <Label>The work</Label>
              <p className="text-sm text-ink-900 whitespace-pre-wrap">
                {t.description}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-400 italic">
              No note — the title is the whole brief.
            </p>
          )}

          <Files label="Brief" files={brief} taskId={t.id} />

          {/*
            Add to the brief after the fact.

            The only Attach control on this card used to live inside the
            submit box, which belongs to the assignee — so the creator had
            no way to attach anything once the task existed. That was
            already awkward for an afterthought drawing, and it made the
            assign form's "add it from the task itself" advice, shown when
            an upload fails, point at something that did not exist.
          */}
          {isCreator && t.status !== "Approved" && (
            <div>
              <label className="btn-ghost text-xs border border-ink-200 cursor-pointer inline-flex">
                <Paperclip size={12} className="mr-1.5" />
                {briefBusy ? "Attaching…" : "Add to the brief"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={briefBusy}
                  onChange={(e) => addToBrief(Array.from(e.target.files ?? []))}
                />
              </label>
              {briefError && (
                <p className="text-xs text-brand-redText mt-1">{briefError}</p>
              )}
            </div>
          )}

          {/* ---- who signs it off ---------------------------------- */}
          <div className="text-xs">
            <Label>Reviewers</Label>
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
            {/* The assigner is not in the chip list — they were not named,
                they are the one who did the naming — so who can actually
                close this has to be spelt out or it looks like the
                reviewers alone. */}
            {reviewers.length > 0 && t.status !== "Approved" && (
              <p className="text-[11px] text-ink-400 mt-1">
                {isCreator ? "You" : t.createdBy} assigned it, so
                {isCreator ? " you" : " they"} can approve it too — any one
                of them is enough.
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

          {canDecideThis && !readOnly && (
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
/**
 * One label treatment for the whole card.
 *
 * There were four before — xs grey, 11px grey, xs ink-500, block ink-500 —
 * and at a glance they all read as "small grey text", which is exactly
 * the complaint: nothing separated a field name from a value or from a
 * passing remark. Uppercase and letter-spaced makes a label unmistakably
 * a label at a size where colour alone cannot carry it.
 */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-0.5">
      {children}
    </span>
  );
}

/**
 * One fact, bounded.
 *
 * The label is what makes a bare date mean something — "06/09/26" on its
 * own could be either end of the task — and it stays lighter than the
 * value so the eye lands on the number first.
 *
 * `tone` carries the whole chip, background included, so an overdue task
 * is visible from across the list rather than being a slightly redder
 * word inside a grey pill.
 */
function Chip({
  icon,
  label,
  children,
  tone,
}: {
  icon?: React.ReactNode;
  label?: string;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[11px] border ${
        tone || "bg-ink-50 text-ink-600 border-ink-200"
      }`}
    >
      {icon && <span className="shrink-0 opacity-60">{icon}</span>}
      {label && <span className="opacity-70">{label}</span>}
      <span className="font-medium tabular-nums">{children}</span>
    </span>
  );
}

function Files({
  label,
  files,
  taskId,
}: {
  label: string;
  files: { id: number; name: string; size: string }[];
  taskId: number;
}) {
  /** The file open in the viewer, if any. */
  const [showing, setShowing] = useState<{
    id: number;
    name: string;
  } | null>(null);

  if (files.length === 0) return null;

  return (
    <div className="text-xs mt-2">
      <Label>{label}</Label>
      <ul className="grid gap-1.5">
        {files.map((f) => {
          const base = `/api/domain/tasks/${taskId}/attachments/${f.id}`;
          const viewable = isViewable(f.name);
          return (
            <li
              key={f.id}
              className="flex items-center gap-2 flex-wrap px-2 py-1.5 rounded border border-ink-200"
            >
              <Paperclip size={11} className="text-ink-400 shrink-0" />
              <span className="text-ink-700 break-all min-w-0">{f.name}</span>
              <span className="text-ink-400">{f.size}</span>

              <span className="flex items-center gap-1 ml-auto shrink-0">
                {/*
                  View and New tab only for what the server will actually
                  render — see the allowlist in domain-task-files. Offering
                  them on a .docx would just trigger a download and leave
                  the reader wondering which button did what.
                */}
                {viewable && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowing({ id: f.id, name: f.name })}
                      className="px-1.5 py-0.5 rounded text-ink-600 hover:bg-ink-100 inline-flex items-center gap-1"
                    >
                      <Eye size={11} /> View
                    </button>
                    <a
                      href={`${base}?view=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-1.5 py-0.5 rounded text-ink-600 hover:bg-ink-100 inline-flex items-center gap-1"
                    >
                      <ExternalLink size={11} /> New tab
                    </a>
                  </>
                )}
                <a
                  href={base}
                  className="px-1.5 py-0.5 rounded text-ink-600 hover:bg-ink-100 inline-flex items-center gap-1"
                >
                  <Download size={11} /> Download
                </a>
              </span>
            </li>
          );
        })}
      </ul>

      {showing && (
        <FileViewer
          taskId={taskId}
          file={showing}
          onClose={() => setShowing(null)}
        />
      )}
    </div>
  );
}

/**
 * Look at a file without leaving the task.
 *
 * Most attachments here are a screenshot or a marked-up sheet, and the
 * question they answer — "is this the right drawing?" — is a two-second
 * one. Making that a download, a file manager and an external viewer is
 * most of a minute, repeated per file.
 *
 * A PDF goes in an iframe rather than an object/embed because the
 * browser's own viewer handles it, and the response carries a sandbox CSP
 * so nothing in the file can reach back into the page.
 */
function FileViewer({
  taskId,
  file,
  onClose,
}: {
  taskId: number;
  file: { id: number; name: string };
  onClose: () => void;
}) {
  const src = `/api/domain/tasks/${taskId}/attachments/${file.id}?view=1`;
  const image = isImageName(file.name);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink-900/60 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-card shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-ink-100">
          <span className="font-medium text-sm text-ink-800 break-all min-w-0">
            {file.name}
          </span>
          <span className="flex items-center gap-1 ml-auto shrink-0">
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-xs border border-ink-200"
            >
              <ExternalLink size={12} className="mr-1.5" /> New tab
            </a>
            <a
              href={`/api/domain/tasks/${taskId}/attachments/${file.id}`}
              className="btn-ghost text-xs border border-ink-200"
            >
              <Download size={12} className="mr-1.5" /> Download
            </a>
            <button
              onClick={onClose}
              aria-label="Close"
              className="btn-ghost text-xs"
            >
              <X size={14} />
            </button>
          </span>
        </div>

        <div className="flex-1 overflow-auto bg-ink-50 flex items-center justify-center p-3 min-h-0">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={file.name}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <iframe
              src={src}
              title={file.name}
              className="w-full h-[75vh] bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
