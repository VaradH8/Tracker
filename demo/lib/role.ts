"use client";

import { useSession } from "next-auth/react";

export type Role = "Admin" | "Coordinator" | "BusinessDeveloper" | "Developer";

export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Admin",
  Coordinator: "Co-ordinator",
  BusinessDeveloper: "Business Developer",
  Developer: "Developer",
};

const VALID: Role[] = ["Admin", "Coordinator", "BusinessDeveloper", "Developer"];

function isRole(r: unknown): r is Role {
  return typeof r === "string" && (VALID as string[]).includes(r);
}

/**
 * useRole returns the current user's role from the NextAuth session.
 * The second tuple element is a no-op setRole (kept for source-compat with
 * earlier code that destructured a setter). Role changes only happen via
 * sign-in / sign-out now.
 */
export function useRole(): [Role, (r: Role) => void, boolean] {
  const { data: session, status } = useSession();
  const hydrated = status !== "loading";
  const sessionRole = (session?.user as { role?: unknown } | undefined)?.role;
  const role: Role = isRole(sessionRole) ? sessionRole : "Coordinator";
  return [role, noop, hydrated];
}

function noop() {
  /* role is read-only; controlled by sign-in */
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
