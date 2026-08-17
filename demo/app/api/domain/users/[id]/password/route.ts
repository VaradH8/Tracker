import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireDomainUser,
  requireDomainRole,
  setDomainPassword,
} from "@/lib/domain-auth";
import { SUPERVISOR_ROLES, canManageUser, manageableRoles, type DomainRole } from "@/lib/domain";

/**
 * Set someone else's password — Admins, Leads and Team Leads, each within
 * the part of the team they manage.
 *
 * This is the "they've forgotten it / they're locked out / I don't trust
 * that password any more" path. It deliberately does NOT ask for the
 * current password: the person setting it is not the account holder and
 * has no way to know it. What stands in for that proof is who they are —
 * `canManageUser`, the same ceiling that governs every other edit — so a
 * Team Lead can reset an SME or Actionee but nobody above them, and an
 * Actionee can reset nobody at all.
 *
 * Resetting signs the target out everywhere (see setDomainPassword).
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  const forbidden = requireDomainRole(actor, SUPERVISOR_ROLES);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const target = await prisma.domainUser.findUnique({
    where: { id },
    select: { id: true, name: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /**
   * Your own password is changed on the Account page, which verifies the
   * current one first. Allowing it here would turn any unattended signed-in
   * session into a way to take the account over without knowing the
   * existing password.
   */
  if (target.id === actor.id) {
    return NextResponse.json(
      {
        error:
          "Change your own password from Account, where it asks for your current one.",
      },
      { status: 400 },
    );
  }

  if (!canManageUser(actor.role, target.role as DomainRole)) {
    const allowed = manageableRoles(actor.role);
    return NextResponse.json(
      {
        error: `You can manage ${allowed.join(", ") || "nobody"} — not a ${target.role}.`,
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const r = await setDomainPassword(target.id, String(body.password ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    name: target.name,
    // So the UI can say "they've been signed out on 2 devices" rather than
    // leaving the consequence of a reset invisible.
    signedOut: r.signedOut,
  });
}
