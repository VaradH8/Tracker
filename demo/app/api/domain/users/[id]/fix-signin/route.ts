import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  loginRateKey,
  requireDomainRole,
  requireDomainUser,
  setDomainPassword,
} from "@/lib/domain-auth";
import { clearRateLimit } from "@/lib/rate-limit";
import {
  SUPERVISOR_ROLES,
  canManageUser,
  manageableRoles,
  type DomainRole,
} from "@/lib/domain";

/**
 * Make this account able to sign in, whatever is wrong with it.
 *
 * Resetting a password fixes one of the four things that stop a login, and
 * an admin has no way of telling which one they are looking at — every
 * other cause reports itself as "Wrong email or password". That is how an
 * afternoon goes into resetting a password that was never wrong.
 *
 * So this does all of them, in one call, and says what it changed:
 *
 *   - the stored email is trimmed and lower-cased. Sign-in looks up a
 *     cleaned address, so a stray space or a capital makes the row
 *     unreachable no matter what the password is.
 *   - the account is switched back on. Deleting somebody with delivery
 *     history is refused, so deactivating is what an admin reaches for
 *     when a login is broken — and it is itself a reason a login is
 *     broken.
 *   - the login throttle is cleared.
 *   - the password is set, if one was given.
 *
 * The one thing it will not do is guess. Two accounts for the same person
 * is a decision about which is real, so it reports both and changes
 * nothing else about them.
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
  const target = await prisma.domainUser.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.id === actor.id) {
    return NextResponse.json(
      { error: "You are signed in — this is for fixing somebody else's login." },
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
  const password =
    typeof body.password === "string" && body.password.length > 0
      ? body.password
      : null;

  const changed: string[] = [];
  const warnings: string[] = [];

  // --- 1. the email the lookup will actually use ----------------------
  const clean = target.email.trim().toLowerCase();
  if (clean !== target.email) {
    const clash = await prisma.domainUser.findUnique({ where: { email: clean } });
    if (clash && clash.id !== target.id) {
      // Cleaning would collide with a second row. That is the duplicate
      // case, and merging two people is not this endpoint's call to make.
      warnings.push(
        `Their stored address is "${target.email}", and cleaning it up would collide with ${clash.name} (${clash.email}). Those two accounts need merging first.`,
      );
    } else {
      await prisma.domainUser.update({
        where: { id: target.id },
        data: { email: clean },
      });
      changed.push(`tidied the address to ${clean}`);
    }
  }

  // --- 2. switched on -------------------------------------------------
  if (!target.isActive) {
    await prisma.domainUser.update({
      where: { id: target.id },
      data: { isActive: true },
    });
    changed.push("switched the account back on");
  }

  // --- 3. the throttle, on both the old and the tidied address --------
  clearRateLimit(loginRateKey(target.email));
  clearRateLimit(loginRateKey(clean));
  changed.push("cleared the login lockout");

  // --- 4. the password, if one was given ------------------------------
  if (password) {
    const r = await setDomainPassword(target.id, password);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    changed.push(
      r.signedOut > 0
        ? `set the password and signed them out of ${r.signedOut} session${r.signedOut === 1 ? "" : "s"}`
        : "set the password",
    );
  }

  // --- 5. anybody else answering to this name -------------------------
  const others = await prisma.domainUser.findMany({
    where: { id: { not: target.id } },
    select: { id: true, name: true, email: true, isActive: true },
  });
  const namesakes = others.filter(
    (u) => u.name.trim().toLowerCase() === target.name.trim().toLowerCase(),
  );
  for (const n of namesakes) {
    warnings.push(
      `There is a second account under the same name: ${n.email}${n.isActive ? "" : " (deactivated)"}. Make sure they are signing in with ${clean}, not that one.`,
    );
  }

  const fixed = await prisma.domainUser.findUnique({ where: { id: target.id } });
  return NextResponse.json({
    ok: true,
    name: target.name,
    email: fixed?.email ?? clean,
    changed,
    warnings,
    /** Nothing left that this endpoint knows how to break a login with. */
    clean: warnings.length === 0,
  });
}
