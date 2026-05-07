import type { Role } from "./role";

const ALLOWED: Record<Role, string[]> = {
  Admin: ["*"],
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
  if (rules.includes("*")) return true;
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
