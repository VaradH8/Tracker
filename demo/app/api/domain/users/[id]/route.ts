import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { DOMAIN_ROLES, type DomainRole } from "@/lib/domain";

/** Admin edits a domain user: role, capacity, or active flag. */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin"]);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (DOMAIN_ROLES.includes(body.role as DomainRole)) data.role = body.role;
  if (Number.isFinite(Number(body.dailyCapacity))) {
    data.dailyCapacity = Math.min(14, Math.max(1, Math.round(Number(body.dailyCapacity))));
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.domainUser.update({ where: { id }, data });
  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role as DomainRole,
      dailyCapacity: updated.dailyCapacity,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}