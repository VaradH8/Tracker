/**
 * Shared, dependency-free helpers for the Domain module. Safe to import
 * from both client and server (no prisma, no next/headers).
 */

export type DomainRole = "Admin" | "Lead" | "TeamLead" | "Actionee";

export const DOMAIN_ROLES: DomainRole[] = [
  "Admin",
  "Lead",
  "TeamLead",
  "Actionee",
];

export const DOMAIN_ROLE_LABELS: Record<DomainRole, string> = {
  Admin: "Admin",
  Lead: "Lead",
  TeamLead: "Team Lead",
  Actionee: "Actionee",
};

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