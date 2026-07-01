import type { Role } from "./role";
import type { Project, Task } from "./mock";

export function canSeeProjectFinancials(role: Role): boolean {
  return role !== "Developer";
}

export function canSeeProjectAudit(role: Role): boolean {
  return role === "Admin" || role === "Lead" || role === "Coordinator";
}

export function canExportData(role: Role): boolean {
  return role !== "Developer";
}

export function canSeeRemarkAuthor(role: Role, isAssignee: boolean): boolean {
  return (
    role === "Admin" ||
    role === "Lead" ||
    role === "Coordinator" ||
    isAssignee
  );
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
  Lead: [
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

export function visibleProjects(
  role: Role,
  allProjects: Project[],
  allTasks: Task[],
  me: string,
): Project[] {
  // Admin: full visibility. Everyone else: only projects they're assigned
  // to (any of the four per-project roles) or where they have a task.
  if (role === "Admin") return allProjects;

  // Coordinators: only the projects they coordinate (mirrors the
  // server-side rule in lib/server-access.ts visibleProjectIds).
  if (role === "Coordinator") {
    return allProjects.filter((p) => p.coordinators.includes(me));
  }

  const fromTasks = new Set(
    allTasks
      .filter((t) => t.assignees.includes(me))
      .map((t) => t.projectId),
  );
  return allProjects.filter(
    (p) =>
      p.leads.includes(me) ||
      p.coordinators.includes(me) ||
      p.developers.includes(me) ||
      p.bds.includes(me) ||
      fromTasks.has(p.id),
  );
}

export function canAccessProject(
  role: Role,
  projectId: number,
  allProjects: Project[],
  allTasks: Task[],
  me: string,
): boolean {
  return visibleProjects(role, allProjects, allTasks, me).some(
    (p) => p.id === projectId,
  );
}
