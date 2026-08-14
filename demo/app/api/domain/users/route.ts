import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireDomainUser,
  requireDomainRole,
  createDomainAccount,
} from "@/lib/domain-auth";
import { DOMAIN_ROLES, canManageUser, type DomainRole } from "@/lib/domain";

function serialize(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  expectedTagsPerDay: number | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as DomainRole,
    expectedTagsPerDay: u.expectedTagsPerDay,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Admins and Leads see the full roster — Leads manage their own team's
 *  members. Everyone else gets the lightweight list of active people
 *  (id, name, role) needed to assign tasks. */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  if (user.role !== "Admin" && user.role !== "Lead") {
    const roster = await prisma.domainUser.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      users: roster.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        expectedTagsPerDay: u.expectedTagsPerDay,
      })),
    });
  }
  const users = await prisma.domainUser.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ users: users.map(serialize) });
}

/**
 * Add a member. Leads can do this as well as Admins — they're the ones
 * building out their own team — but only an Admin can mint another Admin
 * or Lead, so a Lead can't promote their way up.
 */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  const forbidden = requireDomainRole(actor, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const roleInput = String(body.role ?? "Actionee") as DomainRole;
  const role = DOMAIN_ROLES.includes(roleInput) ? roleInput : "Actionee";
  if (!canManageUser(actor.role, role)) {
    return NextResponse.json(
      { error: "Only an Admin can add Admins or Leads." },
      { status: 403 },
    );
  }
  const r = await createDomainAccount({
    name: String(body.name ?? ""),
    email: String(body.email ?? ""),
    password: String(body.password ?? ""),
    role,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  // Expected tags/day, set when the person is added so forecasts have a
  // sensible number before they've built up any approved history.
  const expected = Number(body.expectedTagsPerDay);
  if (Number.isFinite(expected) && expected > 0) {
    await prisma.domainUser.update({
      where: { id: r.id },
      data: { expectedTagsPerDay: Math.round(expected * 100) / 100 },
    });
  }

  const created = await prisma.domainUser.findUnique({ where: { id: r.id } });
  return NextResponse.json({ user: created ? serialize(created) : null });
}