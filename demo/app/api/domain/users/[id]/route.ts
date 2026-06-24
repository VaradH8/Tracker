import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { DOMAIN_ROLES, type DomainRole } from "@/lib/domain";

/** Admin hard-deletes a domain user. Refuses if the person owns projects
 *  or created tasks (those records would be orphaned) — deactivate them
 *  instead. Their assigned tasks just unassign; their work logs go with
 *  them. You can't delete yourself. */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin"]);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  if (id === userOrResp.id) {
    return NextResponse.json(
      { error: "You can't delete your own account." },
      { status: 400 },
    );
  }
  const [ownsProjects, createdTasks] = await Promise.all([
    prisma.domainProject.count({ where: { ownerId: id } }),
    prisma.domainTask.count({ where: { createdById: id } }),
  ]);
  if (ownsProjects > 0 || createdTasks > 0) {
    return NextResponse.json(
      {
        error:
          "This person owns projects or created tasks. Deactivate them instead of deleting.",
      },
      { status: 400 },
    );
  }
  await prisma.domainUser.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

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