"use client";

import { useEffect, useState } from "react";

export type Role = "Admin" | "Coordinator" | "BusinessDeveloper" | "Developer";

export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Admin",
  Coordinator: "Co-ordinator",
  BusinessDeveloper: "Business Developer",
  Developer: "Developer",
};

const VALID: Role[] = ["Admin", "Coordinator", "BusinessDeveloper", "Developer"];
const KEY = "tracker-role";

function isRole(r: unknown): r is Role {
  return typeof r === "string" && (VALID as string[]).includes(r);
}

export function readStoredRole(): Role | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  return isRole(raw) ? raw : null;
}

export function writeStoredRole(r: Role | null) {
  if (typeof window === "undefined") return;
  if (r === null) {
    window.localStorage.removeItem(KEY);
  } else {
    window.localStorage.setItem(KEY, r);
  }
}

/**
 * useRole reads the role from localStorage. Returns:
 *   [role, setRole, hydrated]
 * where `role` defaults to "Coordinator" before hydration to keep the
 * shape stable; consumers that need to know whether the user is *actually*
 * signed in should use useIsSignedIn() instead of trusting the role tuple.
 */
export function useRole(): [Role, (r: Role | null) => void, boolean] {
  const [role, setRoleState] = useState<Role>("Coordinator");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredRole();
    if (stored) setRoleState(stored);
    setHydrated(true);
  }, []);

  function setRole(r: Role | null) {
    writeStoredRole(r);
    if (r) setRoleState(r);
  }

  return [role, setRole, hydrated];
}

export function useIsSignedIn(): { isSignedIn: boolean; hydrated: boolean } {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIsSignedIn(readStoredRole() !== null);
    setHydrated(true);
  }, []);

  return { isSignedIn, hydrated };
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
