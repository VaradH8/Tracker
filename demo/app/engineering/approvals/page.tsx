"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  X,
  History,
  Inbox,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { useDomain } from "@/lib/domain-store";
import {
  fmtDate as fmt,
  submissionStatusCls as statusCls,
} from "@/lib/domain-format";

type Submission = {
  id: number;
  date: string;
  completedCount: number;
  approvedCount: number | null;
  status: string;
  note: string | null;
  reviewNote: string | null;
  projectId: number;
  projectName: string;
  client: string | null;
  divisionName: string | null;
  complexity?: string;
  assigneeId: string;
  assigneeName: string;
  assignedCount: number;
  deliveredCount: number;
  submittedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};


function fmtStamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}


/**
 * The Lead's review desk, in two halves.
 *
 * Pending work is grouped by project, because a Lead clears a project's
 * claims together rather than hopping between them. Reviewed work used to
 * vanish the moment it was decided, leaving no record of who approved what
 * or why — it now sits in a History tab with the count, the date, the
 * reviewer and their comment.
 */
export default function ApprovalsPage() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [pending, setPending] = useState<Submission[] | null>(null);
  const [history, setHistory] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Kept apart from `error` so a broken history doesn't blank the queue. */
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<number | "all">("all");
  /** History drills in one project at a time. */
  const [openProject, setOpenProject] = useState<number | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/domain/tag-submissions?status=Pending", { cache: "no-store" }).then(
        async (r) => {
          if (r.status === 403)
            throw new Error("Approvals are for Team Leads, Leads and Admins.");
          return r.json();
        },
      ),
      // A failed history load used to fall back to an empty list, which the
      // UI then reported as "Nothing has been reviewed yet" — a broken
      // request and an empty desk looked identical. Carry the reason
      // instead, and keep it off the pending half of the page.
      fetch("/api/domain/tag-submissions?reviewed=true", { cache: "no-store" })
        .then(async (r) =>
          r.ok
            ? await r.json()
            : {
                submissions: null,
                error:
                  r.status === 403
                    ? "You don't have access to the approval history."
                    : `The approval history didn't load (HTTP ${r.status}).`,
              },
        )
        .catch(() => ({
          submissions: null,
          error: "The approval history didn't load — check your connection.",
        })),
    ])
      .then(([p, h]) => {
        setPending(p.submissions ?? []);
        setHistory(h.submissions ?? []);
        setHistoryError(h.error ?? null);
        setError(null);
      })
      .catch((e: Error) => {
        setPending([]);
        setHistory([]);
        setError(e.message);
      });
  }, []);

  useEffect(load, [load]);

  const rows = tab === "pending" ? pending : history;

  // Project filter options come from whichever list is showing.
  const projects = useMemo(() => {
    const m = new Map<number, string>();
    (rows ?? []).forEach((s) => m.set(s.projectId, s.projectName));
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = (rows ?? []).filter(
    (s) => projectFilter === "all" || s.projectId === projectFilter,
  );

  const openRows = (rows ?? []).filter(
    (r) => openProject !== null && r.projectId === openProject,
  );

  const pendingTags = (pending ?? []).reduce((n, x) => n + x.completedCount, 0);
  const oldest = (pending ?? []).reduce<string | null>(
    (min, x) => (min === null || x.date < min ? x.date : min),
    null,
  );
  const waitingDays = oldest
    ? Math.round(
        (Date.now() - new Date(oldest + "T00:00:00Z").getTime()) / 86400000,
      )
    : 0;

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Tag approvals"
        description="Completion counts submitted by the team. Approving adds them to the project's delivered total and updates the forecast; you can approve fewer than were claimed and say why."
      />

      {error && (
        <div className="card p-4 mb-6 border-l-4 border-brand-red">
          <p className="text-sm text-brand-redText">{error}</p>
        </div>
      )}

      {/* What is waiting, before the queue itself. */}
      {pending !== null && (
        <section className="card p-6 mb-6">
          {pending.length === 0 ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-brand-greenText shrink-0" />
              <div>
                <p className="font-heading font-semibold text-ink-900">
                  Queue is clear
                </p>
                <p className="text-sm text-ink-500">
                  Every submission has been reviewed.
                  {history && history.length > 0 && (
                    <> {history.length} decision(s) in the history below.</>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <div className="text-xs text-ink-500 font-medium uppercase tracking-wide">
                  Awaiting your review
                </div>
                <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                  <span className="font-heading text-3xl font-semibold text-ink-900">
                    {pending.length} submission{pending.length === 1 ? "" : "s"}
                  </span>
                  <span className="px-3 py-1 rounded-pill text-sm font-semibold bg-brand-yellowBg text-brand-yellowText">
                    {pendingTags} tags claimed
                  </span>
                </div>
                {oldest && (
                  <p className="text-sm text-ink-600 mt-2">
                    Oldest waiting since <strong>{fmt(oldest)}</strong>
                    {waitingDays > 1 && (
                      <span className="text-brand-yellowText">
                        {" "}
                        — {waitingDays} days ago
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <div className="text-[11px] text-ink-500 font-medium uppercase tracking-wide">
                    People
                  </div>
                  <div className="font-heading text-2xl font-semibold mt-0.5">
                    {new Set(pending.map((x) => x.assigneeName)).size}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-ink-500 font-medium uppercase tracking-wide">
                    Projects
                  </div>
                  <div className="font-heading text-2xl font-semibold mt-0.5">
                    {new Set(pending.map((x) => x.projectId)).size}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("pending")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${
              tab === "pending"
                ? "bg-brand-blueBg text-brand-blue"
                : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            <Inbox size={14} /> Awaiting review {pending ? `(${pending.length})` : ""}
          </button>
          <button
            onClick={() => setTab("history")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium ${
              tab === "history"
                ? "bg-brand-blueBg text-brand-blue"
                : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            <History size={14} /> History {history ? `(${history.length})` : ""}
          </button>
        </div>

        {projects.length > 1 && (
          <select
            value={projectFilter}
            onChange={(e) =>
              setProjectFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className="ml-auto px-2 py-1.5 rounded border border-ink-200 text-sm"
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {rows === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : tab === "history" && historyError ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">{historyError}</p>
          <button
            onClick={load}
            className="mt-2 text-sm font-medium text-amber-900 underline"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          {tab === "pending"
            ? "Nothing waiting for review."
            : "Nothing has been reviewed yet."}
        </p>
      ) : openProject === null || openRows.length === 0 ? (
        <ProjectPicker
          rows={filtered}
          mode={tab}
          onOpen={(id) => setOpenProject(id)}
        />
      ) : tab === "pending" ? (
        <PendingDetail
          rows={openRows}
          onBack={() => setOpenProject(null)}
          onReviewed={load}
        />
      ) : (
        <HistoryDetail rows={openRows} onBack={() => setOpenProject(null)} />
      )}
    </DomainPage>
  );
}

/**
 * History, one project at a time.
 *
 * A single flat table across every project was hard to read and harder to
 * search. You pick the project (or client) first, then work inside it.
 */
function ProjectPicker({
  rows,
  mode,
  onOpen,
}: {
  rows: Submission[];
  /** pending = what's waiting on you · history = what's been decided. */
  mode: "pending" | "history";
  onOpen: (id: number) => void;
}) {
  const [q, setQ] = useState("");

  const projects = useMemo(() => {
    const m = new Map<
      number,
      {
        id: number;
        name: string;
        client: string | null;
        approved: number;
        claimed: number;
        decisions: number;
        last: string | null;
        oldest: string | null;
        people: Set<string>;
      }
    >();
    for (const r of rows) {
      const e =
        m.get(r.projectId) ??
        {
          id: r.projectId,
          name: r.projectName,
          client: r.client,
          approved: 0,
          claimed: 0,
          decisions: 0,
          last: null,
          oldest: null,
          people: new Set<string>(),
        };
      e.approved += r.approvedCount ?? 0;
      e.claimed += r.completedCount;
      e.decisions += 1;
      e.people.add(r.assigneeName);
      if (mode === "pending") {
        if (e.oldest === null || r.date < e.oldest) e.oldest = r.date;
      } else if (r.reviewedAt && (e.last === null || r.reviewedAt > e.last)) {
        e.last = r.reviewedAt;
      }
      m.set(r.projectId, e);
    }
    const list = Array.from(m.values());
    const needle = q.trim().toLowerCase();
    return needle
      ? list.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            (p.client ?? "").toLowerCase().includes(needle),
        )
      : list;
  }, [rows, q, mode]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink-400 italic">
        {mode === "pending"
          ? "Nothing waiting for review."
          : "Nothing has been reviewed yet."}
      </p>
    );
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a project or client"
        className="px-3 py-1.5 rounded border border-ink-200 text-sm w-72 mb-4"
      />
      {projects.length === 0 ? (
        <p className="text-sm text-ink-400 italic">Nothing matches that search.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpen(p.id)}
              className="card p-5 text-left hover:shadow-md transition"
            >
              <div className="font-heading font-semibold text-ink-900">
                {p.name}
              </div>
              {p.client && (
                <div className="text-xs text-ink-500 mt-0.5">{p.client}</div>
              )}
              {mode === "pending" ? (
                <>
                  <div className="font-heading text-2xl font-semibold text-brand-yellowText mt-3">
                    {p.decisions}
                  </div>
                  <div className="text-xs text-ink-500">
                    submission{p.decisions === 1 ? "" : "s"} awaiting review
                  </div>
                  <div className="text-xs text-ink-500 mt-2">
                    <strong className="text-ink-700">{p.claimed}</strong> tags
                    claimed · {p.people.size}{" "}
                    {p.people.size === 1 ? "person" : "people"}
                  </div>
                  {p.oldest && (
                    <div className="text-xs text-ink-400 mt-0.5">
                      Oldest from {fmt(p.oldest)}
                    </div>
                  )}
                  <span className="text-sm text-brand-blue inline-flex items-center gap-1 mt-3">
                    Review <ChevronRight size={14} />
                  </span>
                </>
              ) : (
                <>
                  <div className="font-heading text-2xl font-semibold text-brand-greenText mt-3">
                    {p.approved}
                  </div>
                  <div className="text-xs text-ink-500">tags approved</div>
                  <div className="text-xs text-ink-500 mt-2">
                    {p.decisions} decision{p.decisions === 1 ? "" : "s"} ·{" "}
                    {p.people.size} {p.people.size === 1 ? "person" : "people"}
                  </div>
                  {p.last && (
                    <div className="text-xs text-ink-400 mt-0.5">
                      Last {fmtStamp(p.last)}
                    </div>
                  )}
                  <span className="text-sm text-brand-blue inline-flex items-center gap-1 mt-3">
                    View history <ChevronRight size={14} />
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One project's review queue: the cards to act on, with a bulk approve for
 * when a Lead has already satisfied themselves about the lot.
 */
function PendingDetail({
  rows,
  onBack,
  onReviewed,
}: {
  rows: Submission[];
  onBack: () => void;
  onReviewed: () => void;
}) {
  const [person, setPerson] = useState("all");
  const [division, setDivision] = useState("all");

  const uniq = (xs: (string | null)[]) =>
    Array.from(new Set(xs.filter((x): x is string => !!x))).sort();
  const people = uniq(rows.map((r) => r.assigneeName));
  const divisions = uniq(rows.map((r) => r.divisionName));

  const shown = rows.filter(
    (r) =>
      (person === "all" || r.assigneeName === person) &&
      (division === "all" || (r.divisionName ?? "") === division),
  );
  const claimed = shown.reduce((n, r) => n + r.completedCount, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-brand-blue inline-flex items-center gap-1"
          >
            <ChevronLeft size={14} /> All projects
          </button>
          <h2 className="font-heading text-lg font-semibold mt-1">
            {rows[0]?.projectName}
            {rows[0]?.client && (
              <span className="font-sans font-normal text-sm text-ink-500">
                {" "}
                · {rows[0].client}
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-500">
            {shown.length} awaiting review · <strong>{claimed}</strong> tags
            claimed
          </p>
        </div>
        <ApproveAll items={shown} onDone={onReviewed} />
      </div>

      {(people.length > 1 || divisions.length > 1) && (
        <div className="flex items-end gap-3 mb-4 flex-wrap">
          {people.length > 1 && (
            <label className="text-xs text-ink-500">
              <span className="block mb-1">Person</span>
              <ColFilter
                value={person}
                onChange={setPerson}
                options={people}
                label="person"
              />
            </label>
          )}
          {divisions.length > 1 && (
            <label className="text-xs text-ink-500">
              <span className="block mb-1">Division</span>
              <ColFilter
                value={division}
                onChange={setDivision}
                options={divisions}
                label="division"
              />
            </label>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-ink-400 italic">Nothing matches those filters.</p>
      ) : (
        <div className="grid gap-3">
          {shown.map((s) => (
            <ReviewCard key={s.id} s={s} onReviewed={onReviewed} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A dropdown that filters one column to a single value. */
function ColFilter({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Filter by ${label}`}
      className={`w-full px-1.5 py-1 rounded border text-xs ${
        value === "all"
          ? "border-ink-200 text-ink-500"
          : "border-brand-blue text-brand-blue bg-brand-blueBg"
      }`}
    >
      <option value="all">All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * One project's approval history, with a filter on every column that has
 * something to choose between — date, person, division, decision, and who
 * approved it.
 */
function HistoryDetail({
  rows,
  onBack,
}: {
  rows: Submission[];
  onBack: () => void;
}) {
  const [date, setDate] = useState("all");
  const [person, setPerson] = useState("all");
  const [division, setDivision] = useState("all");
  const [decision, setDecision] = useState("all");
  const [approver, setApprover] = useState("all");

  const uniq = (xs: (string | null)[]) =>
    Array.from(new Set(xs.filter((x): x is string => !!x))).sort();

  const dates = uniq(rows.map((r) => r.date)).reverse();
  const people = uniq(rows.map((r) => r.assigneeName));
  const divisions = uniq(rows.map((r) => r.divisionName));
  const decisions = uniq(rows.map((r) => r.status));
  const approvers = uniq(rows.map((r) => r.reviewedBy));

  const shown = rows.filter(
    (r) =>
      (date === "all" || r.date === date) &&
      (person === "all" || r.assigneeName === person) &&
      (division === "all" || (r.divisionName ?? "") === division) &&
      (decision === "all" || r.status === decision) &&
      (approver === "all" || (r.reviewedBy ?? "") === approver),
  );

  const approvedTotal = shown.reduce((n, r) => n + (r.approvedCount ?? 0), 0);
  const claimedTotal = shown.reduce((n, r) => n + r.completedCount, 0);
  const filtered =
    date !== "all" ||
    person !== "all" ||
    division !== "all" ||
    decision !== "all" ||
    approver !== "all";

  function clear() {
    setDate("all");
    setPerson("all");
    setDivision("all");
    setDecision("all");
    setApprover("all");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-brand-blue inline-flex items-center gap-1"
          >
            <ChevronLeft size={14} /> All projects
          </button>
          <h2 className="font-heading text-lg font-semibold mt-1">
            {rows[0]?.projectName}
            {rows[0]?.client && (
              <span className="font-sans font-normal text-sm text-ink-500">
                {" "}
                · {rows[0].client}
              </span>
            )}
          </h2>
        </div>
        <div className="text-right">
          <div className="font-heading text-2xl font-semibold text-brand-greenText">
            {approvedTotal}
          </div>
          <div className="text-xs text-ink-500">
            tags approved{filtered && " (filtered)"} of {claimedTotal} claimed
          </div>
        </div>
      </div>

      {filtered && (
        <button onClick={clear} className="btn-ghost text-xs mb-2">
          Clear filters ({shown.length} of {rows.length} rows)
        </button>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-3 py-2">Work date</th>
              <th className="text-left font-semibold px-3 py-2">Person</th>
              <th className="text-left font-semibold px-3 py-2">Division</th>
              <th className="text-right font-semibold px-3 py-2">Claimed</th>
              <th className="text-right font-semibold px-3 py-2">Approved</th>
              <th className="text-left font-semibold px-3 py-2">Decision</th>
              <th className="text-left font-semibold px-3 py-2">Approved by</th>
              <th className="text-left font-semibold px-3 py-2">Comment</th>
            </tr>
            {/* one filter per column that has a choice to make */}
            <tr className="bg-white border-b border-ink-200">
              <th className="px-3 py-1.5">
                <ColFilter value={date} onChange={setDate} options={dates} label="date" />
              </th>
              <th className="px-3 py-1.5">
                <ColFilter
                  value={person}
                  onChange={setPerson}
                  options={people}
                  label="person"
                />
              </th>
              <th className="px-3 py-1.5">
                <ColFilter
                  value={division}
                  onChange={setDivision}
                  options={divisions}
                  label="division"
                />
              </th>
              <th />
              <th />
              <th className="px-3 py-1.5">
                <ColFilter
                  value={decision}
                  onChange={setDecision}
                  options={decisions}
                  label="decision"
                />
              </th>
              <th className="px-3 py-1.5">
                <ColFilter
                  value={approver}
                  onChange={setApprover}
                  options={approvers}
                  label="approver"
                />
              </th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-ink-400 italic">
                  No rows match those filters.
                </td>
              </tr>
            ) : (
              shown.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 text-ink-700 whitespace-nowrap">
                    {fmt(s.date)}
                  </td>
                  <td className="px-3 py-2 text-ink-900">{s.assigneeName}</td>
                  <td className="px-3 py-2 text-ink-500">
                    {s.divisionName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-700">
                    {s.completedCount}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${
                      s.approvedCount !== null && s.approvedCount < s.completedCount
                        ? "text-brand-yellowText"
                        : "text-ink-900"
                    }`}
                  >
                    {s.approvedCount ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(s.status)}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-700 whitespace-nowrap">
                    {/* No reviewer on an approved row means it never needed
                        one — a Team Lead's own tags count on submission. */}
                    <div>
                      {s.reviewedBy ?? (
                        <span className="text-ink-400 italic">
                          {s.status === "Approved" ? "Auto-approved" : "—"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-400">
                      {fmtStamp(s.reviewedAt)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ink-600">
                    {s.reviewNote ? (
                      <span>&ldquo;{s.reviewNote}&rdquo;</span>
                    ) : (
                      <span className="text-ink-400 italic">no comment</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Approve a whole project's queue at the counts claimed.
 *
 * Deliberately two-step and explicit about what it does: it signs off every
 * claim as submitted, which is only appropriate when a Lead has already
 * satisfied themselves. Anything needing a reduced count or a note still
 * goes through the individual cards.
 */
function ApproveAll({
  items,
  onDone,
}: {
  items: Submission[];
  onDone: () => void;
}) {
  const { current } = useDomain();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * A reviewer's own submissions never enter the bulk set — the server
   * refuses them, so including them would make "approve all" report
   * failures every time a Team Lead has claimed tags of their own.
   */
  const approvable = items.filter((s) => s.assigneeId !== current?.id);
  const skipped = items.length - approvable.length;
  const total = approvable.reduce((n, x) => n + x.completedCount, 0);

  async function run() {
    setBusy(true);
    setError(null);
    const results = await Promise.all(
      approvable.map((s) =>
        fetch(`/api/domain/tag-submissions/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", notify: false }),
        }).then((r) => r.ok),
      ),
    );
    setBusy(false);
    setConfirming(false);
    const failed = results.filter((ok) => !ok).length;
    if (failed > 0) {
      setError(`${failed} of ${approvable.length} could not be approved.`);
    }
    onDone();
  }

  // Nothing here this person is allowed to sign off.
  if (approvable.length === 0) return null;

  if (!confirming) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-brand-redText">{error}</span>}
        <button
          onClick={() => setConfirming(true)}
          className="btn-ghost border border-ink-200 text-sm"
        >
          Approve all as claimed
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-ink-700">
        Approve all {approvable.length} at {total} tags?
        {skipped > 0 && (
          <span className="text-ink-500">
            {" "}
            (your own {skipped} left out)
          </span>
        )}
      </span>
      <button
        onClick={run}
        disabled={busy}
        className="btn-primary text-sm disabled:opacity-50"
      >
        {busy ? "Approving…" : "Yes, approve"}
      </button>
      <button onClick={() => setConfirming(false)} className="btn-ghost text-sm">
        Cancel
      </button>
    </div>
  );
}

function ReviewCard({ s, onReviewed }: { s: Submission; onReviewed: () => void }) {
  const { current } = useDomain();
  /**
   * A Team Lead carries tags as well as reviewing them. The server refuses
   * a self-review outright; showing the controls anyway would just hand
   * them a 403, so the card explains instead.
   */
  const isOwnWork = current?.id === s.assigneeId;
  const [approved, setApproved] = useState(String(s.completedCount));
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);

  const differs = Number(approved) !== s.completedCount;

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
        notify,
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
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-ink-900">
            {s.assigneeName}
            <span className="font-sans font-normal text-sm text-ink-500">
              {" "}
              claims {s.completedCount} tags
            </span>
          </h3>
          {/* What the claim is against. The project was previously only in
              the drill-down header, which left the card itself unable to
              answer "against what?" — the first thing a reviewer asks. */}
          <p className="text-sm text-ink-700 mt-1">
            <span className="font-medium">{s.projectName}</span>
            {s.client && <span className="text-ink-500"> · {s.client}</span>}
            <span className="text-ink-500">
              {" · "}
              {s.divisionName ? `${s.divisionName} division` : "no division"}
            </span>
            {/* Worth knowing before judging a count: a small number on a
                complex batch may be a fine day's work. */}
            {s.complexity === "Complex" && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-pill text-[11px] font-medium bg-brand-yellowBg text-brand-yellowText">
                Complex
              </span>
            )}
          </p>
          <p className="text-xs text-ink-500 mt-0.5">
            Work date {fmt(s.date)}
            {s.submittedBy !== s.assigneeName && ` · filed by ${s.submittedBy}`}
          </p>
          {s.note && <p className="text-sm text-ink-700 mt-2">&ldquo;{s.note}&rdquo;</p>}
        </div>

        {/* Their position on this assignment, so the claim can be judged
            against what they were actually given. "Left after this" tracks
            the approve box live, so trimming a count shows its effect. */}
        <dl className="shrink-0 flex gap-4 text-xs">
          <div className="text-right">
            <dt className="text-ink-500 uppercase tracking-wide">Assigned</dt>
            <dd className="font-heading text-lg font-semibold text-ink-900">
              {s.assignedCount}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-ink-500 uppercase tracking-wide">Delivered</dt>
            <dd className="font-heading text-lg font-semibold text-brand-greenText">
              {s.deliveredCount}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-ink-500 uppercase tracking-wide">
              Left after this
            </dt>
            <dd className="font-heading text-lg font-semibold text-ink-900">
              {Math.max(
                0,
                s.assignedCount -
                  s.deliveredCount -
                  (Number.isFinite(Number(approved)) ? Number(approved) : 0),
              )}
            </dd>
          </div>
        </dl>
      </div>

      {isOwnWork ? (
        <p className="mt-3 text-sm text-ink-600 bg-ink-50 border border-ink-200 rounded px-3 py-2">
          This is your own submission — another Team Lead, a Lead or an Admin
          has to review it.
        </p>
      ) : (
      <>
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
          <span className="block text-ink-700 mb-1">Comment (optional)</span>
          <input
            type="text"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder={differs ? "Why the count differs" : ""}
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

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5 text-xs text-ink-600">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Notify {s.assigneeName}
        </label>
        {differs && (
          <span className="text-xs text-brand-yellowText">
            You&apos;re approving {approved} of {s.completedCount} — worth saying
            why in the comment.
          </span>
        )}
      </div>
      </>
      )}

      {error && <p className="text-sm text-brand-redText mt-2">{error}</p>}
    </article>
  );
}
