import { NextResponse } from "next/server";
import { requireUser, canManageUsers } from "@/lib/server-access";
import { createAccount } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/role";

const ROLES: Role[] = [
  "Admin",
  "Coordinator",
  "BusinessDeveloper",
  "Developer",
];

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;
  // Non-admins only see their own account from this endpoint.
  if (!canManageUsers(user.role)) {
    const me = await prisma.user.findUnique({ where: { id: user.id } });
    return NextResponse.json({ users: me ? [serialize(me)] : [] });
  }
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ users: users.map(serialize) });
}

export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "");
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  const roleInput = String(body.role ?? "Developer") as Role;
  const role = ROLES.includes(roleInput) ? roleInput : "Developer";
  const result = await createAccount({ name, email, role, password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const created = await prisma.user.findUnique({
    where: { id: result.user.id },
  });
  return NextResponse.json({ user: created ? serialize(created) : null });
}

function serialize(u: {
  id: string;
  email: string;
  name: string;
  primaryRole: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.primaryRole as Role,
    isAdmin: u.isAdmin,
    active: u.isActive,
    lastLogin: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
