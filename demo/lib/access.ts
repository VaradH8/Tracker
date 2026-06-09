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

export function visibleProjects(
  role: Role,
  allProjects: Project[],
  allTasks: Task[],
  me: string,
): Project[] {
  if (role === "Admin" || role === "Coordinator") return allProjects;

  if (role === "BusinessDeveloper") {
    return allProjects.filter((p) => p.bd === me);
  }

  // Developer: any project that lists them on the team OR where they're
  // already assigned to a task. Catches new joiners who don't have a
  // task yet but are part of the project.
  const fromTasks = new Set(
    allTasks
      .filter((t) => t.assignees.includes(me))
      .map((t) => t.projectId),
  );
  return allProjects.filter(
    (p) => p.teamMembers.includes(me) || fromTasks.has(p.id),
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
