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
const LAST_KEY = "tracker-last-role";
const IMPERSONATOR_KEY = "tracker-impersonator";

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
    window.localStorage.removeItem(IMPERSONATOR_KEY);
  } else {
    window.localStorage.setItem(KEY, r);
    window.localStorage.setItem(LAST_KEY, r);
  }
}

/* --- Admin "View as" impersonation -------------------------------- */

/** The real role behind an impersonation session (null = not impersonating). */
export function readImpersonator(): Role | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(IMPERSONATOR_KEY);
  return isRole(raw) ? raw : null;
}

/** Admin starts viewing the app as another role. */
export function startImpersonation(target: Role) {
  if (typeof window === "undefined") return;
  if (!readImpersonator()) {
    const current = readStoredRole();
    if (current) window.localStorage.setItem(IMPERSONATOR_KEY, current);
  }
  window.localStorage.setItem(KEY, target);
}

/** Return to the real (admin) role. */
export function stopImpersonation() {
  if (typeof window === "undefined") return;
  const original = readImpersonator();
  window.localStorage.removeItem(IMPERSONATOR_KEY);
  if (original) window.localStorage.setItem(KEY, original);
}

/** The role the user last signed in as — survives sign-out, used to
 *  highlight the same card on the login screen for muscle memory. */
export function readLastRole(): Role | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_KEY);
  return isRole(raw) ? raw : null;
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
