/**
 * Shared, dependency-free helpers for the Domain module. Safe to import
 * from both client and server (no prisma, no next/headers).
 */

export type DomainRole =
  | "Admin"
  | "Lead"
  | "TeamLead"
  | "SME"
  | "Actionee"
  | "CEO";

export const DOMAIN_ROLES: DomainRole[] = [
  "Admin",
  "CEO",
  "Lead",
  "TeamLead",
  "SME",
  "Actionee",
];

export const DOMAIN_ROLE_LABELS: Record<DomainRole, string> = {
  Admin: "Admin",
  CEO: "CEO",
  Lead: "Lead",
  TeamLead: "Team Lead",
  SME: "SME",
  Actionee: "Actionee",
};

/** Roles that do hands-on work — eligible to be assigned tasks and to
 *  appear in the resource-availability view. */
export const WORKING_ROLES: DomainRole[] = ["TeamLead", "SME", "Actionee"];

/**
 * Everyone who can hold tags: the working roles plus Leads, since an Admin
 * may hand tags to a Lead.
 *
 * This is deliberately wider than WORKING_ROLES. Whoever can hold tags has
 * to be bookable onto a project and has to appear in Resource
 * availability — otherwise their outstanding work is invisible to
 * planning, which is precisely how someone ends up showing as Free while
 * carrying a hundred tags. Admins are excluded: they run the module, they
 * don't carry delivery.
 */
export const TAG_HOLDER_ROLES: DomainRole[] = [
  "Lead",
  "TeamLead",
  "SME",
  "Actionee",
];

/**
 * Roles that supervise delivery: they review submissions and see the whole
 * picture — forecast, allocations, deliveries, the team's work log.
 *
 * A Team Lead belongs here but is deliberately NOT trusted with structural
 * or destructive changes. Creating and deleting projects, people, divisions
 * and allocations stays with `["Admin", "Lead"]`, which is spelled out at
 * each of those endpoints rather than hidden behind a constant.
 *
 * Note the overlap with WORKING_ROLES: a Team Lead both supervises and
 * carries tags. That is why approval carries a self-review guard — see
 * app/api/domain/tag-submissions/[id].
 */
export const SUPERVISOR_ROLES: DomainRole[] = ["Admin", "Lead", "TeamLead"];

/**
 * Roles that may READ the whole portfolio: forecast, resource
 * availability, every project — and run a simulation, which answers a
 * what-if without writing anything.
 *
 * Deliberately a separate list from SUPERVISOR_ROLES rather than an
 * addition to it. SUPERVISOR_ROLES gates approving submissions, booking
 * people and resetting passwords as well as reading — so widening it to
 * seat a CEO would hand them the ability to sign off delivery figures
 * they are meant to be judging, which is exactly backwards.
 *
 * A CEO therefore appears here and nowhere else: they see everything and
 * change nothing. They are absent from WORKING_ROLES and TAG_HOLDER_ROLES
 * too, so they never show up as a bookable resource or get handed tags.
 */
export const PORTFOLIO_VIEWER_ROLES: DomainRole[] = [
  ...SUPERVISOR_ROLES,
  "CEO",
];

/**
 * Whether tags claimed by someone in this role have to be signed off by
 * someone else before they count as delivered.
 *
 * Review exists to check work, not to create paperwork: a Team Lead is
 * trusted to record their own delivery, so their submissions are approved
 * on the spot. SMEs and Actionees are reviewed by a Team Lead, Lead or
 * Admin.
 */
export function needsReview(role: DomainRole): boolean {
  return role === "SME" || role === "Actionee";
}

/**
 * Whether one submission has to be signed off by somebody else.
 *
 * Role alone decides it. Self-assigned tags were briefly held for review
 * as well, so that a batch could not be scoped, claimed and approved by
 * the same person — that was reversed by decision: a Lead or Team Lead
 * who takes work on their own initiative records its delivery the same
 * way they record any other, without waiting on a colleague.
 *
 * The consequence is deliberate and worth stating: for self-assigned
 * tags, the delivered figure rests on that person's own account of their
 * own work. What still bounds it is headroom — nobody can claim more
 * than the batch they hold — and the assignment itself remains visible on
 * the project with its creator recorded.
 */
export function submissionNeedsReview(opts: {
  assigneeRole: DomainRole;
  /** Recorded for callers that want to show it; it no longer forces a
   *  review of its own. */
  selfAssigned?: boolean;
}): boolean {
  return needsReview(opts.assigneeRole);
}

/**
 * Whose work log a given role may read, besides their own.
 *
 * Visibility follows the reporting line rather than seniority in general:
 * you can read the log of people whose work you oversee, and not of the
 * people who oversee you.
 *
 *   Admin     — everyone
 *   Lead      — Team Leads, SMEs, Actionees (not Admins or other Leads)
 *   Team Lead — SMEs and Actionees only (not Leads, Admins, or peers)
 *   SME       — nobody
 *   Actionee  — nobody
 *
 * A viewer never appears in their own team view; that is applied at the
 * query, not here, so this list stays a plain statement of the rule.
 */
export function worklogVisibleRoles(role: DomainRole): DomainRole[] {
  // Everyone who does the work. A CEO is excluded rather than merely
  // empty: they never log an hour, so offering them here would put a
  // person in the team log who can only ever have nothing in it.
  if (role === "Admin") return DOMAIN_ROLES.filter((r) => r !== "CEO");
  if (role === "Lead") return ["TeamLead", "SME", "Actionee"];
  if (role === "TeamLead") return ["SME", "Actionee"];
  return [];
}




/**
 * Whose account a given role may administer — edit, promote, deactivate,
 * and (where the endpoint allows it at all) create or remove.
 *
 *   Admin     — everyone, including other Admins
 *   Lead      — Team Leads, SMEs and Actionees
 *   Team Lead — SMEs and Actionees, the people they supervise
 *   others    — nobody
 *
 * This governs BOTH ends of an edit: the role the target currently holds,
 * and the role being handed to them. Checking only the first would let a
 * Lead promote an Actionee to Admin; checking only the second would let
 * them deactivate one.
 *
 * Note this answers "whose account", not "which endpoint". A Team Lead may
 * edit an Actionee but may not create or delete one — that separation is
 * enforced at the routes, which admit only Admin and Lead to POST /users
 * and DELETE /users/[id]. Structural and destructive changes stay with
 * those two, exactly as before.
 *
 * It lives here rather than inline at each endpoint because it was
 * previously written out three times — at create, at delete, and not at
 * all on the edit path, which is exactly how a Lead came to be able to
 * PATCH themselves to Admin.
 */
export function manageableRoles(role: DomainRole): DomainRole[] {
  if (role === "Admin") return [...DOMAIN_ROLES];
  if (role === "Lead") return ["TeamLead", "SME", "Actionee"];
  if (role === "TeamLead") return ["SME", "Actionee"];
  return [];
}

/** Whether `actor` may act on an account holding `target`. */
export function canManageUser(actor: DomainRole, target: DomainRole): boolean {
  return manageableRoles(actor).includes(target);
}

/** Parse an estimated-hours value: a positive number, capped at a sane
 *  ceiling, or null. */
export function parseEstimatedHours(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(1000, Math.round(n * 100) / 100);
}

/**
 * A project's divisions can't promise more tags than the project has.
 * Returns an error message when they do, else null.
 *
 * A project total of 0 means "not set yet" — we can't police a budget that
 * hasn't been declared, so the divisions are left alone.
 */
export function divisionTagsIssue(
  projectTotalTags: number,
  divisionTags: number[],
): string | null {
  if (!Number.isFinite(projectTotalTags) || projectTotalTags <= 0) return null;
  const sum = divisionTags.reduce((a, b) => a + (Number(b) || 0), 0);
  if (sum > projectTotalTags) {
    return `Division tags add up to ${sum}, which is more than the project's ${projectTotalTags}. Reduce the divisions or raise the project total.`;
  }
  return null;
}

/**
 * Tags handed to people can't exceed what the project (or the division,
 * where one applies) actually has. `cap` is the relevant ceiling and
 * `alreadyAssigned` what's already been handed out against it.
 */
export function assignmentCapIssue(
  cap: number,
  alreadyAssigned: number,
  requested: number,
  label: string,
): string | null {
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const remaining = cap - alreadyAssigned;
  if (requested > remaining) {
    return remaining <= 0
      ? `All ${cap} ${label} tags are already assigned.`
      : `Only ${remaining} of the ${cap} ${label} tags are left to assign.`;
  }
  return null;
}

/**
 * A task's life: assigned by someone senior, submitted by the person doing
 * it with a note and the day they did it, then approved or sent back by
 * whoever assigned it.
 *
 * "To Do" and "In Progress" are the old free-floating statuses. Nothing
 * writes them any more, but rows created before this flow existed still
 * carry them, so `normaliseTaskStatus` folds them into Assigned rather
 * than leaving them to render as an unknown state.
 */
export type DomainTaskStatus =
  | "Assigned"
  | "Submitted"
  | "Approved"
  | "Rejected";

export const DOMAIN_TASK_STATUSES: DomainTaskStatus[] = [
  "Assigned",
  "Submitted",
  "Approved",
  "Rejected",
];

export function normaliseTaskStatus(raw: string): DomainTaskStatus {
  return (DOMAIN_TASK_STATUSES as string[]).includes(raw)
    ? (raw as DomainTaskStatus)
    : "Assigned";
}

/** A task is finished only once the person who assigned it agrees. */
export function taskIsOpen(status: string): boolean {
  const s = normaliseTaskStatus(status);
  return s === "Assigned" || s === "Rejected";
}

/**
 * Who each role may assign a task to — everyone below them, and nobody at
 * or above their own level.
 *
 *   Admin     — Leads, Team Leads, SMEs, Actionees
 *   Lead      — Team Leads, SMEs, Actionees
 *   Team Lead — SMEs and Actionees
 *   SME       — nobody
 *   Actionee  — nobody
 *
 * The same shape as `worklogVisibleRoles` on purpose: you can hand work to
 * the people whose work you can read, and to nobody else. Keeping the two
 * aligned means there is no one you can task but never see the result of.
 */
export function assignableRoles(role: DomainRole): DomainRole[] {
  if (role === "Admin") return ["Lead", "TeamLead", "SME", "Actionee"];
  // Leads and Team Leads carry delivery themselves, so tags go sideways
  // and to oneself as well as down: a Lead may hold tags on a project
  // they run, and taking a batch should not require asking an Admin.
  // Still never upward — a Team Lead cannot hand tags to a Lead.
  if (role === "Lead") return ["Lead", "TeamLead", "SME", "Actionee"];
  if (role === "TeamLead") return ["TeamLead", "SME", "Actionee"];
  return [];
}

/**
 * How hard a batch of tags is.
 *
 * Recorded at assignment so delivery can be read with some idea of what
 * it cost. Deliberately does NOT weight the forecast: rates are measured
 * from what people actually approve, and quietly multiplying those by a
 * complexity factor would double-count the difficulty already baked into
 * the measurement.
 */
export const TAG_COMPLEXITIES = ["Simple", "Complex"] as const;
export type TagComplexity = (typeof TAG_COMPLEXITIES)[number];

/** Anything unrecognised — including nothing at all — reads as Simple. */
export function normaliseComplexity(raw: unknown): TagComplexity {
  return (TAG_COMPLEXITIES as readonly string[]).includes(String(raw))
    ? (String(raw) as TagComplexity)
    : "Simple";
}

/** Whether this role can hand out tasks at all. */
export function canAssignTasks(role: DomainRole): boolean {
  return assignableRoles(role).length > 0;
}

/** Work can only be logged between 08:00 and 22:00 IST. */
export const LOG_WINDOW_START_HOUR = 8;
export const LOG_WINDOW_END_HOUR = 22;

/** IST is UTC+5:30 with no DST — a fixed offset, so we can compute it
 *  arithmetically without a timezone library. */
export function istParts(now: Date = new Date()): {
  hour: number;
  minute: number;
  dateISO: string;
} {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return {
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
    dateISO: ist.toISOString().slice(0, 10),
  };
}

/** True if it's currently inside the 08:00–22:00 IST logging window. */
export function withinLogWindow(now: Date = new Date()): boolean {
  const h = istParts(now).hour;
  return h >= LOG_WINDOW_START_HOUR && h < LOG_WINDOW_END_HOUR;
}

/** Midnight UTC of the current IST date — the canonical "day" key we
 *  store work logs against, so a log made at 21:00 IST and one at 09:00
 *  IST the same day share a date. */
export function istDayStart(now: Date = new Date()): Date {
  return new Date(istParts(now).dateISO + "T00:00:00.000Z");
}

export function logWindowLabel(): string {
  return "8:00 AM – 10:00 PM IST";
}

/**
 * How far back an entry may be dated: to the 1st of the current month.
 *
 * Work logs were previously pinned to the day they were filed, so hours
 * could not be invented after the fact. A date picker relaxes that, and
 * the month boundary is what keeps it honest — you can catch up on days
 * you missed within the month you are in, but you cannot reach back into
 * a month that has already been closed off and reported on.
 *
 * The floor moves with the month, so on the 1st it is today and by the
 * 31st it is thirty days back. Entries keep their `createdAt`, so a log
 * written after the day it covers stays visible as such.
 */
export function backdateFloorISO(now: Date = new Date()): string {
  // "YYYY-MM-DD" -> "YYYY-MM-01"; string slicing avoids a Date round-trip
  // that would have to be corrected for the IST offset again.
  return istParts(now).dateISO.slice(0, 8) + "01";
}

/** Human phrasing for the limit, used in both the API error and the UI. */
export function backdateWindowLabel(): string {
  return "back to the 1st of this month";
}