import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireUser, canManageUsers } from "@/lib/server-access";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/role";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  if (!canManageUsers(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  if (id === me.id) {
    return NextResponse.json(
      { error: "You can't delete your own account." },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Hard-delete the user. Cascades take care of Session, TaskAssignee,
  // ProjectMember, Notification, Leave, TimeEntry. We null-out any
  // task/project pointers manually so the work isn't lost, and we drop
  // the user's remarks + audit entries (history follows the person).
  await prisma.$transaction([
    prisma.task.updateMany({
      where: { responsibleId: id },
      data: { responsibleId: null },
    }),
    prisma.task.updateMany({
      where: { approvedById: id },
      data: { approvedById: null, approvedAt: null },
    }),
    prisma.project.updateMany({
      where: { leadId: id },
      data: { leadId: null },
    }),
    prisma.taskAttachment.updateMany({
      where: { uploadedById: id },
      data: { uploadedById: null },
    }),
    prisma.remark.deleteMany({ where: { authorId: id } }),
    prisma.auditEntry.deleteMany({ where: { actorId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}

const ROLES: Role[] = [
  "Admin",
  "Coordinator",
  "BusinessDeveloper",
  "Developer",
];

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const me = userOrResp;
  const { id } = await context.params;

  // Non-admins can only patch themselves, and only their display name.
  const isAdmin = canManageUsers(me.role);
  if (!isAdmin && me.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: {
    name?: string;
    email?: string;
    primaryRole?: Role;
    isActive?: boolean;
    passwordHash?: string;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (isAdmin && typeof body.email === "string" && body.email.trim()) {
    data.email = body.email.trim().toLowerCase();
  }
  if (
    isAdmin &&
    typeof body.role === "string" &&
    ROLES.includes(body.role as Role)
  ) {
    data.primaryRole = body.role as Role;
  }
  if (isAdmin && typeof body.active === "boolean") {
    data.isActive = body.active;
  }
  if (
    isAdmin &&
    typeof body.password === "string" &&
    body.password.length >= 6
  ) {
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Email uniqueness check
  if (data.email) {
    const clash = await prisma.user.findFirst({
      where: { email: data.email, NOT: { id } },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: "That email already has an account." },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.primaryRole as Role,
      isAdmin: updated.isAdmin,
      active: updated.isActive,
      lastLogin: updated.lastLoginAt
        ? updated.lastLoginAt.toISOString()
        : null,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
