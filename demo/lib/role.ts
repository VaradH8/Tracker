"use client";

import { useAccounts } from "./account-store";

export type Role = "Admin" | "Coordinator" | "BusinessDeveloper" | "Developer";

export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Admin",
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
    case "Coordinator":
      return "/my-day";
    case "BusinessDeveloper":
      return "/projects";
    case "Developer":
      return "/my-tasks";
  }
}

export function canEditTasks(role: Role): boolean {
  return role === "Admin" || role === "Coordinator";
}

export function canManageProjects(role: Role): boolean {
  return (
    role === "Admin" ||
    role === "Coordinator" ||
    role === "BusinessDeveloper"
  );
}

export function canManageUsers(role: Role): boolean {
  return role === "Admin";
}
