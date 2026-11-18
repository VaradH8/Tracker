/**
 * Task statuses and what each one means for the rest of the tracker.
 *
 * - Closed (Done, Cancelled): finished. completedAt is stamped, the task is
 *   never overdue and never carried forward.
 * - Paused (Hold): not finished, but nobody is expected to work on it now.
 *   Never overdue, not carried forward, not offered for sprints, and left out
 *   of open-work counts. While on hold it is also left out of performance
 *   evaluation, project progress and sprint plans, like Cancelled. It can be
 *   moved back to any open status at any time; completedAt stays empty.
 * - Everything else is active work.
 */
export const TASK_STATUSES = [
  "To Do",
  "In Progress",
  "Blocked",
  "In review",
  "Hold",
  "Done",
  "Cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CLOSED_STATUSES: readonly string[] = ["Done", "Cancelled"];
export const PAUSED_STATUSES: readonly string[] = ["Hold"];
/** Closed or paused: not work anyone is doing now. */
export const INACTIVE_STATUSES: readonly string[] = [...CLOSED_STATUSES, ...PAUSED_STATUSES];
/** Left out of performance evaluation, project progress and sprint plans. */
export const NOT_EVALUATED_STATUSES: readonly string[] = ["Cancelled", "Hold"];

export function isClosed(status: string): boolean {
  return CLOSED_STATUSES.includes(status);
}
export function isOnHold(status: string): boolean {
  return PAUSED_STATUSES.includes(status);
}
/** Work someone is expected to be doing now: not finished and not on hold. */
export function isActiveWork(status: string): boolean {
  return !INACTIVE_STATUSES.includes(status);
}
export function isEvaluated(status: string): boolean {
  return !NOT_EVALUATED_STATUSES.includes(status);
}
