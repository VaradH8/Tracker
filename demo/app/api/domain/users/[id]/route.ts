import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireDomainUser, requireDomainRole } from "@/lib/domain-auth";
import { DOMAIN_ROLES, type DomainRole } from "@/lib/domain";

/**
 * Delete a domain user.
 *
 * Several relations point at a person with restrict-on-delete (projects
 * they own, tasks/assignments/allocations they created), so the database
 * refuses while any of those exist. This used to swallow that failure and
 * report success, leaving the person very much still there — hence the
 * "delete does nothing" bug. Now every blocker is checked up front and
 * named, and a genuine failure is reported instead of hidden.
 *
 * Their own assigned tags, allocations and submissions cascade away with
 * them; work logs survive with the link cleared.
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  const forbidden = requireDomainRole(actor, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  if (id === actor.id) {
    return NextResponse.json(
      { error: "You can't delete your own account." },
      { status: 400 },
    );
  }

  const target = await prisma.domainUser.findUnique({
    where: { id },
    select: { id: true, name: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A Lead manages their own team; only an Admin removes Admins or Leads.
  if (actor.role !== "Admin" && (target.role === "Admin" || target.role === "Lead")) {
    return NextResponse.json(
      { error: "Only an Admin can remove Admins or Leads." },
      { status: 403 },
    );
  }

  // Everything the database would refuse the delete over, checked by name
  // so the message can say what to do about it.
  const [ownsProjects, createdTasks, createdAssignments, createdAllocations] =
    await Promise.all([
      prisma.domainProject.count({ where: { ownerId: id } }),
      prisma.domainTask.count({ where: { createdById: id } }),
      prisma.domainTagAssignment.count({ where: { createdById: id } }),
      prisma.domainAllocation.count({ where: { createdById: id } }),
    ]);

  const blockers: string[] = [];
  if (ownsProjects > 0) blockers.push(`owns ${ownsProjects} project(s)`);
  if (createdTasks > 0) blockers.push(`created ${createdTasks} task(s)`);
  if (createdAssignments > 0)
    blockers.push(`assigned tags ${createdAssignments} time(s)`);
  if (createdAllocations > 0)
    blockers.push(`made ${createdAllocations} allocation(s)`);

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: `${target.name} ${blockers.join(", ")}. Deleting would erase that history — deactivate them instead, which removes them from every picker and the availability list.`,
        blockers,
        canDeactivate: true,
      },
      { status: 409 },
    );
  }

  try {
    await prisma.domainUser.delete({ where: { id } });
  } catch {
    // Something still references them that we didn't anticipate. Say so
    // rather than claiming success.
    return NextResponse.json(
      {
        error: `Couldn't delete ${target.name} — they're still referenced by other records. Deactivate them instead.`,
        canDeactivate: true,
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, deleted: target.name });
}

/** Admin edits a domain user: role, capacity, or active flag. */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const forbidden = requireDomainRole(userOrResp, ["Admin", "Lead"]);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (DOMAIN_ROLES.includes(body.role as DomainRole)) data.role = body.role;
  if (Number.isFinite(Number(body.dailyCapacity))) {
    data.dailyCapacity = Math.min(14, Math.max(1, Math.round(Number(body.dailyCapacity))));
  }
  // null clears it and puts the person back on the house default.
  if (body.expectedTagsPerDay !== undefined) {
    if (body.expectedTagsPerDay === null || body.expectedTagsPerDay === "") {
      data.expectedTagsPerDay = null;
    } else {
      const rate = Number(body.expectedTagsPerDay);
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json(
          { error: "Expected tags/day must be a positive number." },
          { status: 400 },
        );
      }
      data.expectedTagsPerDay = Math.round(rate * 100) / 100;
    }
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
      expectedTagsPerDay: updated.expectedTagsPerDay,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}