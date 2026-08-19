import { canManageUser, type DomainRole } from "@/lib/domain";

/**
 * Who may do what with attendance and time off.
 *
 * The split the business asked for:
 *   - Admin, Lead and Team Lead MARK people — present, absent, or a half
 *     day with the hours actually worked. They are deciding, so what they
 *     record is approved as it is written.
 *   - SMEs and Actionees REQUEST a leave or a half day for themselves,
 *     and wait. They cannot mark anyone, including themselves, present.
 *
 * "Present" is deliberately not requestable. A person asserting their own
 * attendance is not a request anybody would approve or refuse — it is
 * just a claim, and the register would stop meaning anything.
 */

export const LEAVE_KINDS = ["Present", "Absent", "Half day", "Leave"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

/** What a worker may ask for. Absence they choose is "Leave". */
export const REQUESTABLE_KINDS: LeaveKind[] = ["Half day", "Leave"];

export const LEAVE_STATUSES = ["Pending", "Approved", "Rejected"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export function isLeaveKind(v: unknown): v is LeaveKind {
  return LEAVE_KINDS.includes(v as LeaveKind);
}

/** Admin, Lead and Team Lead run the register. */
export function canMarkAttendance(role: DomainRole): boolean {
  return role === "Admin" || role === "Lead" || role === "TeamLead";
}

/**
 * Whether `actor` may mark or decide for `target`.
 *
 * Reuses the same hierarchy as account management rather than inventing a
 * second one: an Admin covers everyone, a Lead covers Team Leads and
 * below, a Team Lead covers SMEs and Actionees. Two different ladders for
 * "who reports to whom" is how the two drift apart.
 */
export function canMarkFor(actor: DomainRole, target: DomainRole): boolean {
  if (!canMarkAttendance(actor)) return false;
  if (actor === "Admin") return true;
  return canManageUser(actor, target);
}

/** Marking your own attendance is self-certification; approving your own
 *  request is worse. Both are refused, for supervisors too. */
export function canDecide(
  actor: { id: string; role: DomainRole },
  request: { userId: string; targetRole: DomainRole },
): boolean {
  if (actor.id === request.userId) return false;
  return canMarkFor(actor.role, request.targetRole);
}

export type HoursIssue = string | null;

/**
 * Hours are required for a half day and meaningless otherwise.
 *
 * The upper bound is 8 rather than 24: a "half day" of nine hours is
 * someone picking the wrong kind, and letting it through puts a figure
 * into the register that nobody can reconcile later.
 */
export const MAX_HALF_DAY_HOURS = 8;

export function hoursIssue(kind: LeaveKind, hours: unknown): HoursIssue {
  if (kind !== "Half day") {
    return hours === null || hours === undefined || hours === ""
      ? null
      : `Hours only apply to a half day.`;
  }
  const n = Number(hours);
  if (!Number.isFinite(n)) return "How many hours were worked?";
  if (n <= 0) return "Hours must be more than 0.";
  if (n > MAX_HALF_DAY_HOURS) {
    return `More than ${MAX_HALF_DAY_HOURS} hours isn't a half day — mark it Present instead.`;
  }
  // Quarter-hour resolution: finer than that is false precision on a
  // figure someone is typing from memory.
  if (Math.round(n * 4) !== n * 4) {
    return "Use quarter hours — 3, 3.25, 3.5 and so on.";
  }
  return null;
}

/** A request from a worker starts pending; a supervisor's mark does not. */
export function initialStatus(actorRole: DomainRole): LeaveStatus {
  return canMarkAttendance(actorRole) ? "Approved" : "Pending";
}
