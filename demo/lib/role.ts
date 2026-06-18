"use client";

import { useAccounts, type Account } from "./account-store";

export type Role =
  | "Admin"
  | "Lead"
  | "Coordinator"
  | "BusinessDeveloper"
  | "Developer";

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
 * First names of active accounts whose *global* role matches a given
 * team lane — so the "Developers" picker lists only Developers, the
 * "Leads" picker only Leads, and so on. Optionally drops one person by
 * id (used to keep the creator out of their own pickers).
 */
export function candidatesForProjectRole(
  accounts: Account[],
  lane: ProjectRoleKey,
  excludeId?: string,
): string[] {
  const want = GLOBAL_FOR_PROJECT_ROLE[lane];
  return accounts
    .filter((a) => a.active && a.role === want && a.id !== excludeId)
    .map((a) => a.name.split(" ")[0]);
}

export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Admin",
  Lead: "Lead",
  Coordinator: "Co-ordinator",
  BusinessDeveloper: "Business Developer",
  Developer: "Developer",
};

/**
 * The signed-in user's role. Returns `[role, _, hydrated]` to keep the
 * existing 3-tuple API; the setter is now a no-op because role follows
 * the signed-in account — to change role, change accounts.
 */
export function useRole(): [Role, (r: Role | null) => void, boolean] {
  const { current, hydrated } = useAccounts();
  const role: Role = current?.role ?? "Coordinator";
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
