import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Role } from "./role";

const SESSION_COOKIE = "tracker_session";
const SESSION_DAYS = 30;
const PASSWORD_MIN = 10;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isAdmin: boolean;
};

type SignInResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

type RegisterInput = {
  name: string;
  email: string;
  role: Role;
  password: string;
};

/* ------------------------------------------------------------------ */
/* Password strength                                                   */
/* ------------------------------------------------------------------ */

/** Cheap, friendly password rules: 10+ chars, must mix letters and
 *  digits (or a symbol). Internal company tool, not a bank. */
export function passwordIssue(pw: string): string | null {
  if (!pw || pw.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  const hasLetter = /[a-z]/i.test(pw);
  const hasNumOrSym = /[0-9]|[^a-z0-9]/i.test(pw);
  if (!hasLetter || !hasNumOrSym) {
    return "Password needs at least one letter and one digit/symbol.";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Login throttling (in-process)                                       */
/* ------------------------------------------------------------------ */

// In-memory throttle bucket. Survives until the container restarts.
// Acceptable for a single-instance internal tool — would need Redis
// once we scale beyond one app container.
type Bucket = { count: number; lockedUntil: number };
const LOGIN_BUCKETS = new Map<string, Bucket>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_EMAIL = 5;
const LOGIN_MAX_PER_IP = 20;

function bumpAndCheck(
  key: string,
  max: number,
): { locked: boolean; retryInSec: number } {
  const now = Date.now();
  const b = LOGIN_BUCKETS.get(key);
  if (b && b.lockedUntil > now) {
    return { locked: true, retryInSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  if (b && now - (b.lockedUntil - LOGIN_WINDOW_MS) > LOGIN_WINDOW_MS) {
    LOGIN_BUCKETS.delete(key);
  }
  const next = LOGIN_BUCKETS.get(key) ?? { count: 0, lockedUntil: 0 };
  next.count += 1;
  if (next.count >= max) {
    next.lockedUntil = now + LOGIN_WINDOW_MS;
  }
  LOGIN_BUCKETS.set(key, next);
  return { locked: false, retryInSec: 0 };
}

function clearBucket(key: string) {
  LOGIN_BUCKETS.delete(key);
}

/* ------------------------------------------------------------------ */
/* Sign in / sign out                                                  */
/* ------------------------------------------------------------------ */

/** Attempt sign-in. Returns a single generic error on any failure so we
 *  don't leak whether the email exists. Rate-limits per email and per IP
 *  to discourage brute-force. */
export async function signIn(
  emailOrUsername: string,
  password: string,
  ip: string | null = null,
): Promise<SignInResult> {
  const q = emailOrUsername.trim().toLowerCase();
  if (!q || !password) {
    return { ok: false, error: "Enter your account and password." };
  }

  // Throttle BEFORE doing the lookup so we don't spam Postgres on a
  // brute-force run either.
  const emailGate = bumpAndCheck(`em:${q}`, LOGIN_MAX_PER_EMAIL);
  if (emailGate.locked) {
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(emailGate.retryInSec / 60)} min.`,
    };
  }
  if (ip) {
    const ipGate = bumpAndCheck(`ip:${ip}`, LOGIN_MAX_PER_IP);
    if (ipGate.locked) {
      return {
        ok: false,
        error: `Too many failed attempts. Try again in ${Math.ceil(ipGate.retryInSec / 60)} min.`,
      };
    }
  }

  // Match by email exact, OR by first-name prefix, OR by full name.
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: q },
        { name: { startsWith: q + " ", mode: "insensitive" } },
        { name: { equals: q, mode: "insensitive" } },
      ],
    },
  });
  // Single generic error for "no such user", "wrong password", and
  // "deactivated" — leaks no information about which accounts exist.
  const GENERIC = "Wrong account or password.";
  if (!user) return { ok: false, error: GENERIC };
  if (!user.isActive) return { ok: false, error: GENERIC };
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { ok: false, error: GENERIC };

  // Success — clear this email's throttle bucket.
  clearBucket(`em:${q}`);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(user.id);

  return { ok: true, user: toSessionUser(user) };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) {
    await prisma.session.delete({ where: { id: sid } }).catch(() => null);
  }
  jar.delete(SESSION_COOKIE);
}

export async function register(input: RegisterInput): Promise<SignInResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Name is required." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const pwIssue = passwordIssue(input.password);
  if (pwIssue) return { ok: false, error: pwIssue };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "That email already has an account." };
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      primaryRole: input.role,
      isAdmin: input.role === "Admin",
      isActive: true,
      lastLoginAt: new Date(),
    },
  });
  await createSession(user.id);

  return { ok: true, user: toSessionUser(user) };
}

/** Admin "add user" — creates an account without signing in as them. */
export async function createAccount(
  input: RegisterInput,
): Promise<SignInResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Name is required." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const pwIssue = passwordIssue(input.password);
  if (pwIssue) return { ok: false, error: pwIssue };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "That email already has an account." };
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      primaryRole: input.role,
      isAdmin: input.role === "Admin",
      isActive: true,
    },
  });
  return { ok: true, user: toSessionUser(user) };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: sid } }).catch(() => null);
    return null;
  }
  if (!session.user.isActive) return null;
  return toSessionUser(session.user);
}

export async function changePassword(
  currentPassword: string,
  nextPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const current = await getCurrentUser();
  if (!current) return { ok: false, error: "Not signed in." };
  const pwIssue = passwordIssue(nextPassword);
  if (pwIssue) return { ok: false, error: pwIssue };
  const user = await prisma.user.findUnique({ where: { id: current.id } });
  if (!user) return { ok: false, error: "Not signed in." };
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: "Current password doesn't match." };
  const passwordHash = await bcrypt.hash(nextPassword, 10);
  await prisma.user.update({ where: { id: current.id }, data: { passwordHash } });
  return { ok: true };
}

/* ------------------------------------------------------------------ */

async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: { userId, expiresAt },
  });
  const jar = await cookies();
  // Secure-cookie policy: default ON in production (we run behind
  // Caddy / Traefik with real HTTPS) and OFF in dev so localhost
  // logins still work. The legacy SESSION_COOKIE_SECURE env var still
  // wins if set, for cases where the app runs over plain HTTP behind
  // a TLS-terminating LB and the auto-detect is wrong.
  const explicit = process.env.SESSION_COOKIE_SECURE;
  const secure =
    explicit === "1"
      ? true
      : explicit === "0"
        ? false
        : process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

function toSessionUser(u: {
  id: string;
  email: string;
  name: string;
  primaryRole: string;
  isAdmin: boolean;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.primaryRole as Role,
    isAdmin: u.isAdmin,
  };
}
