import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "./db";

export type SessionUser = {
  id: string;
  role: "Admin" | "Coordinator" | "BusinessDeveloper" | "Developer";
  isAdmin: boolean;
  name: string;
  email: string;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    role: session.user.role as SessionUser["role"],
    isAdmin: session.user.isAdmin,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
  };
}

export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export function requireRole(
  user: SessionUser,
  allowed: SessionUser["role"][],
): NextResponse | null {
  if (!allowed.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export function canEditTasks(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Coordinator";
}

export function canManageUsers(role: SessionUser["role"]): boolean {
  return role === "Admin";
}

export function canSeeProjectFinancials(role: SessionUser["role"]): boolean {
  return role !== "Developer";
}

export function canSeeProjectAudit(role: SessionUser["role"]): boolean {
  return role === "Admin" || role === "Coordinator";
}

export async function visibleProjectIds(
  user: SessionUser,
): Promise<number[] | "all"> {
  if (user.role === "Admin" || user.role === "Coordinator") return "all";

  if (user.role === "BusinessDeveloper") {
    const me = user.name.split(" ")[0];
    const rows = await prisma.project.findMany({
      where: { bdName: me },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // Developer: projects with at least one task assigned to them
  const rows = await prisma.taskAssignee.findMany({
    where: { userId: user.id },
    select: { task: { select: { projectId: true } } },
  });
  return Array.from(new Set(rows.map((r) => r.task.projectId)));
}

export async function canAccessProject(
  user: SessionUser,
  projectId: number,
): Promise<boolean> {
  const ids = await visibleProjectIds(user);
  if (ids === "all") return true;
  return ids.includes(projectId);
}

export async function isTaskAssignee(
  userId: string,
  taskId: number,
): Promise<boolean> {
  const row = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });
  return row !== null;
}

export async function writeAudit(
  actorId: string,
  action: string,
  opts: {
    scope?: string;
    taskTitle?: string;
    before?: string;
    after?: string;
  } = {},
) {
  await prisma.auditEntry.create({
    data: {
      actorId,
      action,
      scope: opts.scope,
      taskTitle: opts.taskTitle,
      before: opts.before,
      after: opts.after,
    },
  });
}
