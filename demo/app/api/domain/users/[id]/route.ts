import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireDomainUser,
  requireDomainRole,
  nameClash,
  setDomainEmail,
} from "@/lib/domain-auth";
import {
  DOMAIN_ROLES,
  canManageUser,
  manageableRoles,
  type DomainRole,
} from "@/lib/domain";
import { rateIssue } from "@/lib/forecast";

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
  if (!canManageUser(actor.role, target.role as DomainRole)) {
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

/**
 * Edit a domain user: role, expected tags/day, or active flag.
 *
 * Carries the same ceiling as creating (POST /users) and removing
 * (DELETE above): only an Admin may touch an Admin or a Lead, and only an
 * Admin may hand out those roles. Without it a Lead could simply PATCH
 * themselves to Admin — the grant check on creation would be decorative,
 * since the same privilege is one edit away.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  // Team Leads may edit the people they supervise. Creating and deleting
  // accounts stays with Admin and Lead — see POST /users and DELETE above.
  const forbidden = requireDomainRole(actor, ["Admin", "Lead", "TeamLead"]);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const target = await prisma.domainUser.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  const wantsRole = DOMAIN_ROLES.includes(body.role as DomainRole)
    ? (body.role as DomainRole)
    : null;
  const wantsDeactivate = body.isActive === false;

  // Both ends of the edit: who they are now, and what they'd become.
  const allowed = manageableRoles(actor.role);
  if (!canManageUser(actor.role, target.role as DomainRole)) {
    return NextResponse.json(
      {
        error: `You can manage ${allowed.join(", ") || "nobody"} — not a ${target.role}.`,
      },
      { status: 403 },
    );
  }
  if (wantsRole && !canManageUser(actor.role, wantsRole)) {
    return NextResponse.json(
      { error: `You can't give someone the ${wantsRole} role.` },
      { status: 403 },
    );
  }

  /**
   * Nobody edits their own role or switches themselves off. Same reason
   * DELETE refuses self-deletion: it is either an accident that locks you
   * out, or an escalation dressed up as an edit.
   */
  if (target.id === actor.id) {
    if (wantsRole && wantsRole !== target.role) {
      return NextResponse.json(
        { error: "You can't change your own role." },
        { status: 403 },
      );
    }
    if (wantsDeactivate) {
      return NextResponse.json(
        { error: "You can't deactivate your own account." },
        { status: 400 },
      );
    }
  }

  /**
   * The module must keep at least one active Admin. Demoting or
   * deactivating the last one would leave nobody able to restore it —
   * there is no back door, by design.
   */
  const losesAdmin =
    target.role === "Admin" &&
    ((wantsRole && wantsRole !== "Admin") || wantsDeactivate);
  if (losesAdmin) {
    const activeAdmins = await prisma.domainUser.count({
      where: { role: "Admin", isActive: true },
    });
    if (activeAdmins <= 1) {
      return NextResponse.json(
        {
          error:
            "This is the only active Admin. Promote someone else to Admin first, or the module would be left with nobody who can manage it.",
        },
        { status: 400 },
      );
    }
  }

  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (wantsRole) data.role = wantsRole;

  /**
   * Renaming. Held to the same uniqueness rule as creating an account:
   * two people answering to one name makes every picker ambiguous, and
   * renaming into a clash would create exactly the state creation refuses.
   */
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    }
    if (name !== target.name) {
      const clash = await nameClash(name, target.id);
      if (clash) {
        return NextResponse.json(
          {
            error: `${clash.name} already has an account (${clash.email}). Use a name that tells them apart.`,
          },
          { status: 400 },
        );
      }
      data.name = name;
    }
  }

  /**
   * The sign-in email. A credential change rather than a profile edit —
   * it is what domainSignIn looks the account up by — so it goes through
   * the same validation and uniqueness check as creation.
   */
  let emailChanged = false;
  if (typeof body.email === "string" && body.email.trim()) {
    const r = await setDomainEmail(target.id, body.email);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    emailChanged = true;
  }
  // null clears it and puts the person back on the house default.
  if (body.expectedTagsPerDay !== undefined) {
    if (body.expectedTagsPerDay === null || body.expectedTagsPerDay === "") {
      data.expectedTagsPerDay = null;
    } else {
      const issue = rateIssue(body.expectedTagsPerDay);
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
      const rate = Number(body.expectedTagsPerDay);
      data.expectedTagsPerDay = Math.round(rate * 100) / 100;
    }
  }

  // The email is written by setDomainEmail above rather than through
  // `data`, so an email-only edit leaves `data` empty while still being a
  // real change. Only a request that changed nothing at all is refused.
  if (Object.keys(data).length === 0 && !emailChanged) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated =
    Object.keys(data).length === 0
      ? await prisma.domainUser.findUniqueOrThrow({ where: { id } })
      : await prisma.domainUser.update({ where: { id }, data });
  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role as DomainRole,
      expectedTagsPerDay: updated.expectedTagsPerDay,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}