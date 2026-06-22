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
  // Non-admins get the basic roster of active people — names + roles —
  // so they can assign tasks and staff project teams. HR / contact fields
  // (salary, phone, location) are redacted; only admins see those.
  if (!canManageUsers(user.role)) {
    const roster = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }],
    });
    return NextResponse.json({ users: roster.map(serializeRoster) });
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
  designation: string | null;
  phone: string | null;
  location: string | null;
  hourlyRate: number;
  capacityPerWeek: number;
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
    designation: u.designation ?? "",
    phone: u.phone ?? "",
    location: u.location ?? "",
    hourlyRate: u.hourlyRate,
    capacityPerWeek: u.capacityPerWeek,
  };
}

/** Roster view for non-admins: identity + role only. Salary and personal
 *  contact details are redacted so the people-pickers and team/resources
 *  views work without leaking HR data. */
function serializeRoster(u: {
  id: string;
  email: string;
  name: string;
  primaryRole: string;
  isAdmin: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  designation: string | null;
  capacityPerWeek: number;
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
    designation: u.designation ?? "",
    phone: "",
    location: "",
    hourlyRate: 0,
    capacityPerWeek: u.capacityPerWeek,
  };
}
