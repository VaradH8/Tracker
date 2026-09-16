import type { Role } from "./role";

/**
 * Who may approve (or deny) whose leave.
 *
 * Approval flows *up* the org: a request is decided by somebody senior to
 * the requester — never by the requester themself, never by a peer.
 *
 *   Developer / BusinessDeveloper  →  Coordinator, Lead or Admin
 *   Coordinator                    →  Lead or Admin
 *   Lead                           →  Admin
 *   Admin                          →  Admin
 *
 * An Admin is the top of the chain, so an admin may approve any leave,
 * including their own — otherwise an admin's leave could never be
 * approved in an org with a single admin.
 *
 * Shared by the API routes (the gate that matters) and the Leaves page
 * (so the UI only offers Approve / Deny where the server would say yes).
 */
const SENIORITY: Record<Role, number> = {
  Admin: 3,
  Lead: 2,
  Coordinator: 1,
  BusinessDeveloper: 0,
  Developer: 0,
};

export type LeaveParty = { id: string; role: Role };

export function canApproveLeave(
  actor: LeaveParty,
  requester: LeaveParty,
): boolean {
  if (actor.role === "Admin") return true;
  if (actor.id === requester.id) return false;
  const mine = SENIORITY[actor.role] ?? -1;
  const theirs = SENIORITY[requester.role] ?? -1;
  return mine > theirs;
}

/** Why an approval was refused — for the 403 body and the toast. */
export function leaveApprovalRefusal(
  actor: LeaveParty,
  requester: LeaveParty,
): string {
  if (actor.id === requester.id) return "You can't approve your own leave.";
  return "Only someone senior to the requester can approve this leave.";
}

/** Sentence subject for "… will see it for approval." after a request. */
export function leaveApproverLabel(requesterRole: Role): string {
  switch (requesterRole) {
    case "Admin":
      return "Another admin";
    case "Lead":
      return "An admin";
    case "Coordinator":
      return "Your lead or an admin";
    default:
      return "Your co-ordinator";
  }
}
