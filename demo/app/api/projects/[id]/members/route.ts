import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canManageProjectTasks,
  requireUser,
  userByFirstName,
  writeAudit,
} from "@/lib/server-access";
import { serializeProject } from "@/lib/serializers";

const PROJECT_INCLUDE = {
  client: true,
  members: { include: { user: true } },
  _count: { select: { tasks: true } },
} as const;

const ROLES = ["Lead", "Coordinator", "Developer", "BD"] as const;
type ProjectRole = (typeof ROLES)[number];

/**
 * POST { name, role, action: "add" | "remove" | "toggle" }
 * Adds or removes a single (user, role) assignment on this project.
 * Same user may have multiple rows (one per role they hold).
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  const { id: idStr } = await context.params;
  const projectId = Number(idStr);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  // Per-project authority — a project Lead/Coord can manage the roster
  // even if their global role is BD or Developer.
  if (!(await canManageProjectTasks(actor, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "");
  const role = String(body.role ?? "Developer") as ProjectRole;
  const action: "add" | "remove" | "toggle" = body.action ?? "toggle";
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  }
  const target = await userByFirstName(name);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const existing = await prisma.projectMember.findUnique({
    where: {
      projectId_userId_role: { projectId, userId: target.id, role },
    },
  });
  let didChange: "added" | "removed" | null = null;
  if (
    (action === "remove" && existing) ||
    (action === "toggle" && existing)
  ) {
    await prisma.projectMember.delete({
      where: {
        projectId_userId_role: { projectId, userId: target.id, role },
      },
    });
    didChange = "removed";
  } else if (
    (action === "add" && !existing) ||
    (action === "toggle" && !existing)
  ) {
    await prisma.projectMember.create({
      data: { projectId, userId: target.id, role },
    });
    didChange = "added";
  }
  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: PROJECT_INCLUDE,
  });
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (didChange) {
    await writeAudit(actor.id, `project.member_${didChange}`, {
      scope: updated.name,
      before: didChange === "removed" ? `${role}: ${name}` : undefined,
      after: didChange === "added" ? `${role}: ${name}` : undefined,
    });
  }
  return NextResponse.json({ project: serializeProject(updated) });
}
