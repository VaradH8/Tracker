"use client";

import { useEffect, useState } from "react";

export type Role = "Admin" | "Coordinator" | "BusinessDeveloper" | "Developer";

export const ROLE_LABELS: Record<Role, string> = {
  Admin: "Admin",
  Coordinator: "Co-ordinator",
  BusinessDeveloper: "Business Developer",
  Developer: "Developer",
};

const KEY = "tracker-demo-role";

export function useRole(): [Role, (r: Role) => void, boolean] {
  const [role, setRoleState] = useState<Role>("Coordinator");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY) as Role | null;
    if (
      stored === "Admin" ||
      stored === "Coordinator" ||
      stored === "BusinessDeveloper" ||
      stored === "Developer"
    ) {
      setRoleState(stored);
    }
    setHydrated(true);
  }, []);

  function setRole(r: Role) {
    window.localStorage.setItem(KEY, r);
    setRoleState(r);
  }

  return [role, setRole, hydrated];
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
