import type { Role } from "./role";
import type { Project, Task } from "./mock";

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
    "/users",
    "/audit",
    "/leaves",
    "/settings",
    "/profile",
    "/calendar",
    "/notifications",
  ],
  Coordinator: [
    "/my-day",
    "/my-tasks",
    "/projects",
    "/resources",
    "/leaves",
    "/profile",
    "/calendar",
    "/notifications",
    "/team",
  ],
  BusinessDeveloper: [
    "/projects",
    "/clients",
    "/leaves",
    "/profile",
    "/calendar",
    "/notifications",
  ],
  Developer: [
    "/my-day",
    "/my-tasks",
    "/projects",
    "/leaves",
    "/profile",
    "/calendar",
    "/notifications",
  ],
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

export function visibleProjects(
  role: Role,
  allProjects: Project[],
  allTasks: Task[],
): Project[] {
  if (role === "Admin" || role === "Coordinator") return allProjects;

  const me = meName(role);

  if (role === "BusinessDeveloper") {
    return allProjects.filter((p) => p.bd === me);
  }

  const myProjectIds = new Set(
    allTasks
      .filter((t) => t.assignees.includes(me))
      .map((t) => t.projectId),
  );
  return allProjects.filter((p) => myProjectIds.has(p.id));
}

export function canAccessProject(
  role: Role,
  projectId: number,
  allProjects: Project[],
  allTasks: Task[],
): boolean {
  return visibleProjects(role, allProjects, allTasks).some(
    (p) => p.id === projectId,
  );
}
