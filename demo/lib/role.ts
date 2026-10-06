"use client";

import { labelOf, useAccounts, type Account } from "./account-store";
import { accessRole, type AnyRole } from "./role-access";

/** "HR" has the Co-ordinator's access plus performance-report downloads —
 *  see lib/role-access.ts. */
export type Role = AnyRole;

/** The per-project team lanes, and the global Role each one draws from.
 *  A "Leads" lane only offers people whose global role is Lead, etc. */
export type ProjectRoleKey = "Lead" | "Coordinator" | "Developer" | "BD";

const GLOBAL_FOR_PROJECT_ROLE: Record<ProjectRoleKey, Role> = {
  Lead: "Lead",
  Coordinator: "Coordinator",
  Developer: "Developer",
  BD: "BusinessDeveloper",
};

/**
 * First names of active accounts eligible for a given team lane. A lane
 * lists people whose global role matches it ("Developers" → Developers,
 * etc.). Admins are additionally eligible for the Leads lane, since an
 * admin can act as a project lead. Optionally drops one person by id.
 */
export function candidatesForProjectRole(
  accounts: Account[],
  lane: ProjectRoleKey,
  excludeId?: string,
): string[] {
  const want = GLOBAL_FOR_PROJECT_ROLE[lane];
  const adminEligible = lane === "Lead";
  return accounts
    .filter(
      (a) =>
        a.active &&
        a.id !== excludeId &&
        (a.role === want || (adminEligible && (a.role === "Admin" || a.isAdmin))),
    )
    .map((a) => labelOf(a));
}

export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Admin",
  Lead: "Lead",
  Coordinator: "Co-ordinator",
  HR: "HR",
  BusinessDeveloper: "Business Developer",
  Developer: "Developer",
};

/**
 * The signed-in user's role *for access decisions*. Returns
 * `[role, _, hydrated]` to keep the existing 3-tuple API; the setter is
 * now a no-op because role follows the signed-in account — to change
 * role, change accounts. HR resolves to "Coordinator" here (same access);
 * read `current.role` from useAccounts() for the account's real role.
 */
export function useRole(): [Role, (r: Role | null) => void, boolean] {
  const { current, hydrated } = useAccounts();
  const role: Role = accessRole(current?.role ?? "Coordinator");
  function setRole(_: Role | null) {
    /* role is derived from the signed-in account; this setter is a no-op
       to preserve the legacy call-site shape. */
  }
  return [role, setRole, hydrated];
}

export function useIsSignedIn(): { isSignedIn: boolean; hydrated: boolean } {
  const { current, hydrated } = useAccounts();
  return { isSignedIn: current != null, hydrated };
}

export function landingFor(role: Role): string {
  switch (role) {
    case "Admin":
      return "/dashboard";
    case "Lead":
      return "/my-day";
    case "Coordinator":
    case "HR":
      return "/my-day";
    case "BusinessDeveloper":
      return "/projects";
    case "Developer":
      return "/my-tasks";
  }
}

export function canEditTasks(role: Role): boolean {
  // Lead acts like a senior Coordinator — same task-edit authority
  // across projects they're on. (Per-project authority via
  // canManageProjectTasks still kicks in for non-Lead/Coord users.)
  return role === "Admin" || role === "Lead" || role === "Coordinator";
}

export function canManageProjects(role: Role): boolean {
  return (
    role === "Admin" ||
    role === "Lead" ||
    role === "Coordinator" ||
    role === "BusinessDeveloper"
  );
}

export function canManageUsers(role: Role): boolean {
  return role === "Admin";
}
