"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, CheckCircle2, Clock, X } from "lucide-react";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DateInput } from "@/components/DateInput";
import { SearchSelect } from "@/components/SearchSelect";
import { loadJson } from "@/lib/domain-fetch";
import { dateClass } from "@/lib/domain-ui";
import {
  fmtDate as fmt,
  submissionStatusCls as statusCls,
} from "@/lib/domain-format";

type Assignment = {
  id: number;
  projectId?: number;
  projectName: string;
  client: string | null;
  divisionName: string | null;
  complexity?: string;
  handoverDate: string | null;
  startDate: string | null;
  targetDate: string | null;
  assignedCount: number;
  deliveredCount: number;
  remainingCount: number;
  pendingCount: number;
  /** Who handed it over. */
  createdBy?: string | null;
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
  /** Who handed the batch over — see the tag-submissions route. */
  assignedBy?: string | null;
};

const ALL = "all";

/**
 * The actionee's own view: what they're carrying, and the end-of-day box
 * for "I finished N today". Submitting queues the count for a Lead — it
 * doesn't move the delivered total on its own.
 *
 * The page used to be an unfiltered run of cards followed by an unfiltered
 * run of submissions. That is fine at three assignments and unusable at
 * thirty: somebody carrying work on six projects had to scroll the lot to
 * find the one they were about to submit against, and "what did I submit
 * on Metro last week" could not be asked at all.
 *
 * So: one filter bar over both halves. Project and division narrow what
 * you are carrying and what you have submitted alike, because they are the
 * same two questions asked of the same work. The date range applies only
 * to the history — an assignment is not something that happened on a day.
 */
export default function MyTagsPage() {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [project, setProject] = useState(ALL);
  const [division, setDivision] = useState(ALL);
  const [assigner, setAssigner] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /** Newest first by default — the day you are most likely asking about. */
  const [newestFirst, setNewestFirst] = useState(true);

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([
      loadJson<{ assignments: Assignment[] }>("/api/domain/tag-assignments?mine=true"),
      loadJson<{ submissions: Submission[] }>("/api/domain/tag-submissions?mine=true"),
    ])
      .then(([a, s]) => {
        setAssignments(a.assignments ?? []);
        setSubmissions(s.submissions ?? []);
      })
      // A refusal is reported rather than rendered as "you hold no tags",
      // which is the same sentence the screen shows when that is genuinely
      // true — and the reader has no way to tell the two apart.
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(load, [load]);

  const rows = assignments ?? [];

  /**
   * Filter options come from the work itself, not from the whole
   * organisation — offering a project somebody holds no tags on is an
   * option that can only ever produce an empty screen.
   */
  const projectOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of rows) names.add(a.projectName);
    for (const s of submissions) names.add(s.projectName);
    return Array.from(names).map((n) => ({ value: n, label: n }));
  }, [rows, submissions]);

  const divisionOptions = useMemo(() => {
    const names = new Set<string>();
    // Only the divisions inside the chosen project, so the two filters
    // cannot be combined into something that matches nothing.
    for (const a of rows) {
      if (project !== ALL && a.projectName !== project) continue;
      if (a.divisionName) names.add(a.divisionName);
    }
    for (const s of submissions) {
      if (project !== ALL && s.projectName !== project) continue;
      if (s.divisionName) names.add(s.divisionName);
    }
    return Array.from(names).map((n) => ({ value: n, label: n }));
  }, [rows, submissions, project]);

  /** Everyone who has handed this person work, across both halves. */
  const assignerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of rows) if (a.createdBy) names.add(a.createdBy);
    for (const sub of submissions) if (sub.assignedBy) names.add(sub.assignedBy);
    return Array.from(names).map((n) => ({ value: n, label: n }));
  }, [rows, submissions]);

  // A division picked under one project is meaningless under another.
  useEffect(() => {
    if (division !== ALL && !divisionOptions.some((d) => d.value === division)) {
      setDivision(ALL);
    }
  }, [divisionOptions, division]);

  const shownAssignments = rows.filter(
    (a) =>
      (project === ALL || a.projectName === project) &&
      (division === ALL || a.divisionName === division) &&
      (assigner === ALL || a.createdBy === assigner),
  );

  const shownSubmissions = submissions
    .filter(
      (s) =>
        (project === ALL || s.projectName === project) &&
        (division === ALL || s.divisionName === division) &&
        (assigner === ALL || s.assignedBy === assigner) &&
        (status === ALL || s.status === status) &&
        (!from || s.date >= from) &&
        (!to || s.date <= to),
    )
    // By day, either way round. Two submissions on one day keep the order
    // they were entered in, which is the only tiebreak that means
    // anything here.
    .sort((a, b) =>
      newestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
    );

  /**
   * Batches with tags left to claim, once delivered and already-pending
   * ones are taken off. Everything else is history and lives below.
   */
  const toSubmit = shownAssignments.filter(
    (a) => a.assignedCount - a.deliveredCount - a.pendingCount > 0,
  );

  const filtered =
    project !== ALL ||
    division !== ALL ||
    assigner !== ALL ||
    status !== ALL ||
    !!from ||
    !!to;

  // Totals follow the filter: the point of narrowing to one project is to
  // see that project's position, not the whole book's.
  const total = shownAssignments.reduce(
    (acc, a) => ({
      assigned: acc.assigned + a.assignedCount,
      delivered: acc.delivered + a.deliveredCount,
      pending: acc.pending + a.pendingCount,
      remaining: acc.remaining + a.remainingCount,
    }),
    { assigned: 0, delivered: 0, pending: 0, remaining: 0 },
  );

  return (
    <DomainPage width="wide">
      <PageHeader
        title="My tags"
        description="What you're carrying, and what you've submitted. Enter what you finished at the end of the day — your Lead reviews it, and only then does it count as delivered."
      />

      {loadError ? (
        <div className="card p-3 border-l-4 border-brand-red flex items-center justify-between gap-3">
          <p className="text-sm text-brand-redText">{loadError}</p>
          <button onClick={load} className="btn-ghost text-xs">
            Try again
          </button>
        </div>
      ) : assignments === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : rows.length === 0 && submissions.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          Nothing assigned to you yet.
        </p>
      ) : (
        <>
          {/* ---- one bar, both halves ------------------------------- */}
          <div className="card p-4 mb-5 flex items-end gap-3 flex-wrap">
            <label className="text-xs">
              <span className="block text-ink-700 font-medium mb-1">Project</span>
              <SearchSelect
                value={project}
                onChange={setProject}
                size="sm"
                className="min-w-[180px]"
                searchPlaceholder="Search projects"
                options={[{ value: ALL, label: "All projects" }, ...projectOptions]}
              />
            </label>

            <label className="text-xs">
              <span className="block text-ink-700 font-medium mb-1">Division</span>
              <SearchSelect
                value={division}
                onChange={setDivision}
                size="sm"
                className="min-w-[160px]"
                disabled={divisionOptions.length === 0}
                searchPlaceholder="Search divisions"
                options={[
                  { value: ALL, label: "All divisions" },
                  ...divisionOptions,
                ]}
              />
            </label>

            <label className="text-xs">
              <span className="block text-ink-700 font-medium mb-1">
                Assigned by
              </span>
              <SearchSelect
                value={assigner}
                onChange={setAssigner}
                size="sm"
                className="min-w-[150px]"
                disabled={assignerOptions.length === 0}
                searchPlaceholder="Search people"
                options={[{ value: ALL, label: "Anyone" }, ...assignerOptions]}
              />
            </label>

            {/* Submissions only — an assignment has no decision on it. */}
            <label className="text-xs">
              <span className="block text-ink-700 font-medium mb-1">Status</span>
              <SearchSelect
                value={status}
                onChange={setStatus}
                size="sm"
                className="min-w-[130px]"
                sorted={false}
                options={[
                  { value: ALL, label: "Any status" },
                  { value: "Pending", label: "Pending" },
                  { value: "Approved", label: "Approved" },
                  { value: "Rejected", label: "Sent back" },
                ]}
              />
            </label>

            {/* Labelled for what it actually does. A bare "From/To" beside
                a project filter reads as though it narrows the assignments
                too, and it does not — an assignment is not an event. */}
            <label className="text-xs">
              <span className="block text-ink-700 font-medium mb-1">
                Submitted from
              </span>
              <DateInput
                value={from}
                max={to || undefined}
                onChange={setFrom}
                className={dateClass("sm")}
              />
            </label>
            <label className="text-xs">
              <span className="block text-ink-700 font-medium mb-1">to</span>
              <DateInput
                value={to}
                min={from || undefined}
                onChange={setTo}
                className={dateClass("sm")}
              />
            </label>

            {filtered && (
              <button
                onClick={() => {
                  setProject(ALL);
                  setDivision(ALL);
                  setAssigner(ALL);
                  setStatus(ALL);
                  setFrom("");
                  setTo("");
                }}
                className="btn-ghost text-xs"
              >
                <X size={13} className="mr-1" /> Clear
              </button>
            )}

            <div className="ml-auto text-sm text-ink-500">
              <strong className="text-brand-greenText">{total.delivered}</strong>
              {" of "}
              <strong className="text-ink-900">{total.assigned}</strong> tags
              delivered
              {total.pending > 0 && (
                <span className="text-brand-yellowText">
                  {" · "}
                  {total.pending} waiting
                </span>
              )}
              {total.remaining > 0 && (
                <span>
                  {" · "}
                  {total.remaining} left
                </span>
              )}
            </div>
          </div>

          {/*
            Only what still needs submitting.

            This listed everything assigned, which on a team whose work is
            largely delivered meant a card per finished batch — the same
            projects, at the same totals, as the history immediately below
            it. Two lists saying the same thing, and the reader has to work
            out which is which.

            A batch with nothing left to claim has nothing to do on this
            screen; it is in the history. So the section holds the ones you
            can act on and disappears entirely when there are none, which
            is the point at which it was purely duplication.
          */}
          {toSubmit.length > 0 && (
            <section className="mb-8">
              <h2 className="font-heading text-lg font-semibold mb-3">
                To submit
                <span className="text-ink-400 font-normal text-sm">
                  {" "}
                  ({toSubmit.length})
                </span>
              </h2>
              <div className="grid gap-3">
                {toSubmit.map((a) => (
                  <AssignmentCard key={a.id} a={a} onSubmitted={load} />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
              <h2 className="font-heading text-lg font-semibold">
                Your submissions
                <span className="text-ink-400 font-normal text-sm">
                  {" "}
                  ({shownSubmissions.length})
                </span>
              </h2>
              {shownSubmissions.length > 1 && (
                <button
                  onClick={() => setNewestFirst((v) => !v)}
                  className="btn-ghost text-xs"
                >
                  <ArrowUpDown size={13} className="mr-1" />
                  {newestFirst ? "Newest first" : "Oldest first"}
                </button>
              )}
            </div>
            {shownSubmissions.length === 0 ? (
              <p className="text-sm text-ink-400 italic">
                {submissions.length === 0
                  ? "Nothing submitted yet."
                  : "Nothing submitted in that range."}
              </p>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-semibold px-4 py-2">Date</th>
                      <th className="text-left font-semibold px-4 py-2">Project</th>
                      <th className="text-right font-semibold px-4 py-2">
                        Submitted
                      </th>
                      <th className="text-right font-semibold px-4 py-2">
                        Approved
                      </th>
                      <th className="text-left font-semibold px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {shownSubmissions.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2 text-ink-700 whitespace-nowrap">
                          {fmt(s.date)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-ink-900">{s.projectName}</div>
                          {s.divisionName && (
                            <div className="text-xs text-ink-500">
                              {s.divisionName}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-ink-700 tabular-nums">
                          {s.completedCount}
                        </td>
                        <td className="px-4 py-2 text-right text-ink-700 tabular-nums">
                          {s.approvedCount ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(s.status)}`}
                          >
                            {s.status}
                          </span>
                          {s.reviewNote && (
                            <div className="text-xs text-ink-500 mt-0.5">
                              {s.reviewNote}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </DomainPage>
  );
}

/**
 * One assignment: where it is, how far along, and the box to claim
 * today's work.
 *
 * The submit box only appears once you ask for it. Every card carrying an
 * open input made the page a wall of form fields, when the thing you
 * actually came to do is submit against exactly one of them.
 */
function AssignmentCard({
  a,
  onSubmitted,
}: {
  a: Assignment;
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The count just submitted, echoed back so the actionee can see exactly
   *  what went to their Lead rather than an empty box. */
  const [justSubmitted, setJustSubmitted] = useState<number | null>(null);
  /** Team Lead tags count on submission; everyone else's wait for review. */
  const [autoApproved, setAutoApproved] = useState(false);

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
    setAutoApproved(body.autoApproved === true);
    setCount("");
    setNote("");
    setOpen(false);
    onSubmitted();
  }

  const pct = a.assignedCount > 0 ? (a.deliveredCount / a.assignedCount) * 100 : 0;

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-ink-900">
            {a.projectName}
            {a.divisionName && (
              <span className="text-ink-500 font-normal"> · {a.divisionName}</span>
            )}
            {a.complexity === "Complex" && (
              <span className="ml-2 px-1.5 py-0.5 rounded-pill text-[11px] font-medium bg-brand-yellowBg text-brand-yellowText align-middle">
                Complex
              </span>
            )}
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {a.client ? `${a.client} · ` : ""}
            {a.startDate || a.targetDate
              ? `Your dates ${fmt(a.startDate)} → ${fmt(a.targetDate)} · `
              : ""}
            Handover {fmt(a.handoverDate)}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-lg font-heading font-semibold text-ink-900 tabular-nums">
              {a.deliveredCount} / {a.assignedCount}
            </div>
            <div className="text-xs text-ink-500">delivered</div>
          </div>
          {claimable > 0 && (
            <button
              onClick={() => setOpen((v) => !v)}
              className={open ? "btn-ghost text-sm" : "btn-primary text-sm"}
            >
              {open ? "Cancel" : "Submit work"}
            </button>
          )}
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
        {claimable === 0 && (
          <span className="text-ink-400 italic">
            Everything here is delivered or waiting on approval.
          </span>
        )}
      </div>

      {open && claimable > 0 && (
        <div className="flex items-end gap-2 mt-3 flex-wrap pt-3 border-t border-ink-100">
          <label className="text-sm">
            <span className="block text-ink-700 mb-1">Completed today</span>
            <input
              type="number"
              min={1}
              max={claimable}
              value={count}
              autoFocus
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
          <span className="text-xs text-ink-400 w-full">
            Up to {claimable} left to claim here.
          </span>
        </div>
      )}

      {justSubmitted !== null && (
        <p className="text-sm text-brand-greenText mt-2 inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          You submitted{" "}
          <strong>
            {justSubmitted} tag{justSubmitted === 1 ? "" : "s"}
          </strong>{" "}
          —
          {autoApproved
            ? " counted as delivered straight away."
            : " sent to your Lead for approval."}
        </p>
      )}
      {error && <p className="text-sm text-brand-redText mt-2">{error}</p>}
    </article>
  );
}
