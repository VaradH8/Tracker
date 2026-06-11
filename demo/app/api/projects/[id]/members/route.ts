import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canEditTasks,
  requireUser,
  userByFirstName,
} from "@/lib/server-access";

/**
 * POST { name, action: "add" | "remove" | "toggle" }
 * Adds or removes a teammate from a project's roster (separate from
 * task assignments — a roster member is "on the project" even before
 * they're given a task).
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canEditTasks(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: idStr } = await context.params;
  const projectId = Number(idStr);
  if (!Number.isFinite(projectId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "");
  const action: "add" | "remove" | "toggle" = body.action ?? "toggle";
  const target = await userByFirstName(name);
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: target.id } },
  });
  if (
    (action === "remove" && existing) ||
    (action === "toggle" && existing)
  ) {
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: target.id } },
    });
  } else if (
    (action === "add" && !existing) ||
    (action === "toggle" && !existing)
  ) {
    await prisma.projectMember.create({
      data: { projectId, userId: target.id },
    });
  }
  const updated = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { include: { user: true } } },
  });
  return NextResponse.json({
    teamMembers:
      updated?.members.map((m) => m.user.name.split(" ")[0]) ?? [],
  });
}
