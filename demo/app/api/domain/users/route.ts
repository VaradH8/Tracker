import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireDomainUser,
  requireDomainRole,
  createDomainAccount,
} from "@/lib/domain-auth";
import { DOMAIN_ROLES, type DomainRole } from "@/lib/domain";

function serialize(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  dailyCapacity: number;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as DomainRole,
    dailyCapacity: u.dailyCapacity,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Admin sees the full roster; everyone else gets the lightweight list of
 *  active people (id, name, role) needed to assign tasks. */
export async function GET() {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  if (user.role !== "Admin") {
    const roster = await prisma.domainUser.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      users: roster.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    });
  }
  const users = await prisma.domainUser.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ users: users.map(serialize) });
}

export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin"]);
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const roleInput = String(body.role ?? "Actionee") as DomainRole;
  const role = DOMAIN_ROLES.includes(roleInput) ? roleInput : "Actionee";
  const r = await createDomainAccount({
    name: String(body.name ?? ""),
    email: String(body.email ?? ""),
    password: String(body.password ?? ""),
    role,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  // Optional non-default capacity.
  const capacity = Number(body.dailyCapacity);
  if (Number.isFinite(capacity) && capacity > 0 && capacity !== 8) {
    await prisma.domainUser.update({
      where: { id: r.id },
      data: { dailyCapacity: Math.min(14, Math.max(1, Math.round(capacity))) },
    });
  }
  const created = await prisma.domainUser.findUnique({ where: { id: r.id } });
  return NextResponse.json({ user: created ? serialize(created) : null });
}