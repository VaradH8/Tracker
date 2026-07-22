/**
 * Shared, dependency-free helpers for the Domain module. Safe to import
 * from both client and server (no prisma, no next/headers).
 */

export type DomainRole = "Admin" | "Lead" | "TeamLead" | "SME" | "Actionee";

export const DOMAIN_ROLES: DomainRole[] = [
  "Admin",
  "Lead",
  "TeamLead",
  "SME",
  "Actionee",
];

export const DOMAIN_ROLE_LABELS: Record<DomainRole, string> = {
  Admin: "Admin",
  Lead: "Lead",
  TeamLead: "Team Lead",
  SME: "SME",
  Actionee: "Actionee",
};

/** Roles that do hands-on work — eligible to be assigned tasks and to
 *  appear in the resource-availability view. */
export const WORKING_ROLES: DomainRole[] = ["TeamLead", "SME", "Actionee"];

/** Ceiling on a single bulk-create request, so one typo in the quantity
 *  box can't spawn thousands of tasks. */
export const MAX_BULK_TASKS = 200;

/** Spread `count` items across `assignees` by round-robin, so 20 items
 *  over 4 people is 5 each and 22 is 6,6,5,5 — the earlier names in the
 *  list absorb the remainder. Returns one assignee per item, or all nulls
 *  when nobody was picked (the tasks land unassigned). */
export function distributeEvenly<T>(count: number, assignees: T[]): (T | null)[] {
  if (assignees.length === 0) return Array<T | null>(count).fill(null);
  return Array.from({ length: count }, (_, i) => assignees[i % assignees.length]);
}

/** Titles for a bulk batch: "Support" x 20 becomes "Support 1" … "Support 20". */
export function bulkTaskTitles(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

/** Parse an estimated-hours value: a positive number, capped at a sane
 *  ceiling, or null. */
export function parseEstimatedHours(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(1000, Math.round(n * 100) / 100);
}

export type DomainTaskStatus = "To Do" | "In Progress" | "Done";
export const DOMAIN_TASK_STATUSES: DomainTaskStatus[] = [
  "To Do",
  "In Progress",
  "Done",
];

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