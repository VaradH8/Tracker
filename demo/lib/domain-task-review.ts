import type { DomainTaskStatus } from "@/lib/domain";

/**
 * Who signs a task off, and what that does to it.
 *
 * A task can name several reviewers, and **any one of them approving
 * closes it**. They are a pool, not a chain — the first person to look at
 * it decides, which is what you want when three people are named so that
 * whoever is free can pick it up.
 *
 * The cost of that is real and has to be designed around: two of the three
 * never reviewed anything, and "3 reviewers" on a closed task reads as
 * three opinions. So nothing here ever reports a bare count — the whole
 * set comes back with each decision attached, and `reviewSummary` names
 * the one who actually decided.
 *
 * Naming nobody is a decision too. A task with no reviewers is approved
 * the moment it is submitted, which is how "assign it to myself and get
 * on with it" works without a second screen.
 */

export const REVIEW_DECISIONS = ["Pending", "Approved", "Rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export type Reviewer = {
  userId: string;
  name?: string;
  decision: ReviewDecision;
  decidedAt?: Date | string | null;
  note?: string | null;
};

export function isReviewDecision(v: unknown): v is ReviewDecision {
  return (REVIEW_DECISIONS as readonly string[]).includes(v as string);
}

/**
 * What a task becomes when it is submitted.
 *
 * Nobody to ask means nobody to wait for. This is the only place a task
 * reaches Approved without a person pressing approve, and it is deliberate
 * — the alternative is a queue that nobody is in, holding work that is
 * finished.
 */
export function statusOnSubmit(reviewers: Reviewer[]): DomainTaskStatus {
  return reviewers.length === 0 ? "Approved" : "Submitted";
}

/**
 * What a task becomes when one reviewer decides.
 *
 * Approve closes it outright, because any one is enough. Reject sends it
 * back to be redone rather than closing it: work that came back wrong is
 * still work somebody wants, and a terminal Rejected would mean raising
 * the whole task again to say "fix the one sheet".
 */
export function statusOnDecision(decision: ReviewDecision): DomainTaskStatus {
  return decision === "Approved" ? "Approved" : "Assigned";
}

/**
 * Whether a decision resets everybody else back to Pending.
 *
 * A send-back does. What comes back after a correction is not the work
 * anybody looked at, so an approval given before it would be an opinion
 * about a different submission — and with any-one-approves, one stale
 * approval sitting there would close the task the instant it is
 * resubmitted, without anybody reading the fix.
 */
export function resetsOtherReviewers(decision: ReviewDecision): boolean {
  return decision === "Rejected";
}

/** Whether this person is one of the task's reviewers. */
export function isReviewer(reviewers: Reviewer[], userId: string): boolean {
  return reviewers.some((r) => r.userId === userId);
}

/**
 * Whether this person may decide on this task right now.
 *
 * A named reviewer, or the person who assigned it.
 *
 * The assigner used to be shut out the moment they named somebody else,
 * on the reasoning that naming a reviewer delegates the decision. In
 * practice it strands the task: the one person who knows whether the work
 * is what they asked for is the one who asked for it, and if their
 * reviewer is away, nobody can close it at all.
 *
 * So naming a reviewer adds people who may sign off; it does not remove
 * the assigner. Any one of them closes it, which is already how multiple
 * reviewers behave — this just puts the assigner in that set.
 *
 * Still not open house. Someone neither asked to review nor responsible
 * for the task cannot decide it, whatever their role, because a name
 * against a review that never happened is exactly what the reviewer list
 * exists to prevent.
 *
 * The status check matters as much as the identity one: without it a
 * second approver pressing the button on an already-closed task would
 * move the "decided by" name to whoever was slowest.
 */
export function canDecide(
  reviewers: Reviewer[],
  userId: string,
  status: DomainTaskStatus,
  createdById?: string | null,
): boolean {
  if (status !== "Submitted") return false;
  return isReviewer(reviewers, userId) || (!!createdById && createdById === userId);
}

/**
 * Whether this person may submit the task.
 *
 * The assignee, and only the assignee. Somebody else marking your work
 * done is not a shortcut anybody asked for, and a reviewer doing it would
 * be signing off their own submission.
 *
 * Rejected is submittable because that is what sending back means: the
 * task returns to Assigned and the same person tries again.
 */
export function canSubmit(
  assigneeId: string | null,
  userId: string,
  status: DomainTaskStatus,
): boolean {
  return assigneeId === userId && (status === "Assigned" || status === "Rejected");
}

export type ReviewSummary = {
  /** Everyone asked, in the order they were named. */
  total: number;
  /** The one whose decision closed it, if any. */
  decidedBy: string | null;
  decision: ReviewDecision | null;
  /** Named but never acted — the number that stops "3 reviewers" lying. */
  untouched: string[];
  waitingOn: string[];
};

/**
 * A sentence's worth of truth about who actually reviewed something.
 *
 * Built for the one weakness of any-one-approves: a closed task looks
 * thoroughly checked when it may have been seen by a single person. The
 * names of those who did not look are as much a part of the record as the
 * name of the one who did.
 */
export function reviewSummary(reviewers: Reviewer[]): ReviewSummary {
  const decided = reviewers.find((r) => r.decision !== "Pending") ?? null;
  const pending = reviewers.filter((r) => r.decision === "Pending");
  const label = (r: Reviewer) => r.name ?? r.userId;
  return {
    total: reviewers.length,
    decidedBy: decided ? label(decided) : null,
    decision: decided ? decided.decision : null,
    untouched: decided ? pending.map(label) : [],
    waitingOn: decided ? [] : pending.map(label),
  };
}

/**
 * Reviewer ids from whatever the request sent, cleaned up.
 *
 * Deduped, because naming somebody twice would give them two rows and a
 * unique constraint violation rather than a useful error. The assignee is
 * dropped: approving your own work is not review, and letting it through
 * would make "assign to yourself with yourself as reviewer" a way to close
 * anything instantly while looking like it had been checked.
 */
export function cleanReviewerIds(
  raw: unknown,
  assigneeId: string | null,
): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  return Array.from(new Set(ids)).filter((id) => id !== assigneeId);
}
