import type { Role } from "./role";

export function canSeeProjectFinancials(role: Role): boolean {
  return role !== "Developer";
}

export function canSeeProjectAudit(role: Role): boolean {
  return role === "Admin" || role === "Coordinator";
}

export function canExportData(role: Role): boolean {
  return role !== "Developer";
}

export function canSeeRemarkAuthor(role: Role, isAssignee: boolean): boolean {
  return role === "Admin" || role === "Coordinator" || isAssignee;
}

const ALLOWED: Record<Role, string[]> = {
  Admin: [
    "/dashboard",
    "/projects",
    "/resources",
    "/clients",
    "/leaves",
    "/settings",
    "/profile",
  ],
  Coordinator: [
    "/my-day",
    "/my-tasks",
    "/projects",
    "/resources",
    "/leaves",
    "/profile",
  ],
  BusinessDeveloper: ["/projects", "/clients", "/leaves", "/profile"],
  Developer: ["/my-day", "/my-tasks", "/projects", "/leaves", "/profile"],
};

export function canAccess(role: Role, pathname: string): boolean {
  const rules = ALLOWED[role];
  return rules.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

export function meName(role: Role): string {
  switch (role) {
    case "Admin":
      return "Varad";
    case "Coordinator":
      return "Manasi";
    case "BusinessDeveloper":
      return "Rohit";
    case "Developer":
      return "Sanjana";
  }
}
