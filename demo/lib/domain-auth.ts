import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { passwordIssue } from "./auth";
import { rateLimit } from "./rate-limit";
import { DOMAIN_ROLES, type DomainRole } from "./domain";

/**
 * Auth for the Domain module — a completely separate session system from
 * the tracker. Different cookie, different user table. Signing in here
 * has no bearing on the tracker session and vice-versa.
 */

const DOMAIN_COOKIE = "domain_session";
const SESSION_DAYS = 30;

export type DomainSessionUser = {
  id: string;
  email: string;
  name: string;
  role: DomainRole;
};

function toSessionUser(u: {
  id: string;
  email: string;
  name: string;
  role: string;
}): DomainSessionUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role as DomainRole };
}

function cookieSecure(): boolean {
  const explicit = process.env.SESSION_COOKIE_SECURE;
  if (explicit === "1") return true;
  if (explicit === "0") return false;
  return process.env.NODE_ENV === "production";
}

async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.domainSession.create({
    data: { userId, expiresAt },
  });
  const jar = await cookies();
  jar.set(DOMAIN_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    expires: expiresAt,
  });
}

export async function getDomainUser(): Promise<DomainSessionUser | null> {
  const jar = await cookies();
  const sid = jar.get(DOMAIN_COOKIE)?.value;
  if (!sid) return null;
  const session = await prisma.domainSession.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.domainSession.delete({ where: { id: sid } }).catch(() => null);
    return null;
  }
  if (!session.user.isActive) return null;
  return toSessionUser(session.user);
}

export async function requireDomainUser(): Promise<
  DomainSessionUser | NextResponse
> {
  const user = await getDomainUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

/** Returns a 403 response if the user isn't one of `allowed`, else null. */
export function requireDomainRole(
  user: DomainSessionUser,
  allowed: DomainRole[],
): NextResponse | null {
  if (!allowed.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// Brute-force throttle for domain sign-in, mirroring the tracker's login
// gate. Per-email and per-IP, fixed 15-minute window.
const DOMAIN_LOGIN_MAX_PER_EMAIL = 5;
const DOMAIN_LOGIN_MAX_PER_IP = 20;
const DOMAIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function domainSignIn(
  email: string,
  password: string,
  ip: string | null = null,
): Promise<{ ok: true; user: DomainSessionUser } | { ok: false; error: string }> {
  const q = email.trim().toLowerCase();
  if (!q || !password) {
    return { ok: false, error: "Enter your email and password." };
  }
  const emailGate = rateLimit(
    `domain-login:em:${q}`,
    DOMAIN_LOGIN_MAX_PER_EMAIL,
    DOMAIN_LOGIN_WINDOW_MS,
  );
  if (!emailGate.ok) {
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(emailGate.retryInSec / 60)} min.`,
    };
  }
  if (ip) {
    const ipGate = rateLimit(
      `domain-login:ip:${ip}`,
      DOMAIN_LOGIN_MAX_PER_IP,
      DOMAIN_LOGIN_WINDOW_MS,
    );
    if (!ipGate.ok) {
      return {
        ok: false,
        error: `Too many failed attempts. Try again in ${Math.ceil(ipGate.retryInSec / 60)} min.`,
      };
    }
  }
  const user = await prisma.domainUser.findUnique({ where: { email: q } });
  const GENERIC = "Wrong email or password.";
  if (!user || !user.isActive) return { ok: false, error: GENERIC };
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { ok: false, error: GENERIC };
  await createSession(user.id);
  return { ok: true, user: toSessionUser(user) };
}

export async function domainSignOut(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(DOMAIN_COOKIE)?.value;
  if (sid) {
    await prisma.domainSession.delete({ where: { id: sid } }).catch(() => null);
  }
  jar.delete(DOMAIN_COOKIE);
}

/** Create a domain account. `signInAfter` is used by the first-admin
 *  bootstrap; admins adding teammates leave it false. */
export async function createDomainAccount(
  input: { name: string; email: string; password: string; role: DomainRole },
  opts: { signInAfter?: boolean } = {},
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Name is required." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!DOMAIN_ROLES.includes(input.role)) {
    return { ok: false, error: "Pick a valid role." };
  }
  const pwIssue = passwordIssue(input.password);
  if (pwIssue) return { ok: false, error: pwIssue };
  const existing = await prisma.domainUser.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "That email already has an account." };
  }
  const clash = await nameClash(name);
  if (clash) {
    return {
      ok: false,
      error: `${clash.name} already has an account (${clash.email}). Use a name that tells them apart — full name, or add an initial.`,
    };
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.domainUser.create({
    data: { name, email, passwordHash, role: input.role, isActive: true },
  });
  if (opts.signInAfter) await createSession(user.id);
  return { ok: true, id: user.id };
}

/**
 * Someone already answering to this display name, if any.
 *
 * Two accounts sharing a name makes every people-picker ambiguous: work
 * gets assigned to one and read off the other. Emails are unique, names
 * are not, so this is enforced deliberately rather than by a constraint.
 *
 * Compared case- and whitespace-insensitively in JS rather than with
 * Prisma's `mode: "insensitive"`, which is Postgres-only and would break
 * the SQLite path. The table is small enough that reading the names costs
 * nothing.
 */
export async function nameClash(
  name: string,
  exceptId?: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const all = await prisma.domainUser.findMany({
    select: { id: true, name: true, email: true },
  });
  return (
    all.find(
      (u) => u.id !== exceptId && u.name.trim().toLowerCase() === wanted,
    ) ?? null
  );
}

export async function countDomainUsers(): Promise<number> {
  return prisma.domainUser.count();
}

/**
 * A supervisor sets someone else's password.
 *
 * Distinct from `changeDomainPassword`, which is the self-service path and
 * demands the current password. Here the actor is not the account holder
 * and cannot know it — the authority comes from who they are, checked by
 * the caller against `canManageUser`.
 *
 * Every existing session for that person is retired. A password set by
 * someone else is usually set because the old one is unknown, forgotten or
 * suspect; leaving live sessions running would mean whoever held the old
 * one keeps their access for the rest of the 30-day window, and the reset
 * would look effective while achieving nothing. The person is signed out
 * everywhere and has to use the new password.
 *
 * The actor's own sessions are untouched — they are a different account.
 */
export async function setDomainPassword(
  targetId: string,
  nextPassword: string,
): Promise<{ ok: true; signedOut: number } | { ok: false; error: string }> {
  const target = await prisma.domainUser.findUnique({ where: { id: targetId } });
  if (!target) return { ok: false, error: "Account not found." };

  const pwIssue = passwordIssue(nextPassword);
  if (pwIssue) return { ok: false, error: pwIssue };

  const passwordHash = await bcrypt.hash(nextPassword, 10);
  await prisma.domainUser.update({
    where: { id: target.id },
    data: { passwordHash },
  });
  const { count } = await prisma.domainSession.deleteMany({
    where: { userId: target.id },
  });
  return { ok: true, signedOut: count };
}

/**
 * Change the email an account signs in with.
 *
 * The email IS the credential here — it is what `domainSignIn` looks up —
 * so this is a credential change, not a profile edit, and it is held to
 * the same uniqueness rule as creating an account.
 */
export async function setDomainEmail(
  targetId: string,
  nextEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = nextEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const clash = await prisma.domainUser.findUnique({ where: { email } });
  if (clash && clash.id !== targetId) {
    return { ok: false, error: "That email already has an account." };
  }
  await prisma.domainUser.update({ where: { id: targetId }, data: { email } });
  return { ok: true };
}

/** A signed-in domain user changes their own password. Verifies the
 *  current password, enforces the shared strength rules, and rejects a
 *  no-op change. */
export async function changeDomainPassword(
  userId: string,
  currentPassword: string,
  nextPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!currentPassword || !nextPassword) {
    return { ok: false, error: "Enter your current and new password." };
  }
  const user = await prisma.domainUser.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "Account not found." };
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: "Current password doesn't match." };
  const pwIssue = passwordIssue(nextPassword);
  if (pwIssue) return { ok: false, error: pwIssue };
  const same = await bcrypt.compare(nextPassword, user.passwordHash);
  if (same) {
    return { ok: false, error: "New password must be different from the current one." };
  }
  const passwordHash = await bcrypt.hash(nextPassword, 10);
  await prisma.domainUser.update({ where: { id: user.id }, data: { passwordHash } });

  /**
   * Retire every session issued under the old password. People change a
   * password precisely because it might be compromised, and sessions that
   * outlive it would let whoever had it stay signed in for the rest of the
   * 30-day window — the change would look effective while achieving
   * nothing. The device doing the change gets a fresh session immediately,
   * so it isn't signed out mid-action.
   */
  await prisma.domainSession.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  return { ok: true };
}