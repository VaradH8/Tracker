import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Role } from "./role";
import { accessRole } from "./role-access";
import { clearRateLimit, peekRateLimit, rateLimit } from "./rate-limit";
import { hashSessionToken, newSessionToken } from "./session-token";

const SESSION_COOKIE = "tracker_session";
const SESSION_DAYS = 30;
const PASSWORD_MIN = 10;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  /** Role for access checks — HR resolves to "Coordinator" (same access;
   *  see lib/role-access.ts). */
  role: Role;
  /** The account's real role ("HR" stays "HR"). Absent means the same as
   *  `role`. Use it for labels and HR-only privileges, never to widen
   *  access. */
  primaryRole?: Role;
  isAdmin: boolean;
  /** May assign tasks to anyone active, Admins included. Absent means no. */
  canAssignAnyone?: boolean;
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
/* Password-reset tokens                                               */
/* ------------------------------------------------------------------ */

/** A fresh, high-entropy reset token to embed in the emailed link. 32
 *  random bytes (~256 bits), url-safe. This is the secret the user
 *  presents; only its hash is ever stored (see hashResetToken), so the
 *  raw value can't be recovered from the database. */
export function newResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 of a reset token — the value stored as PasswordResetToken.id
 *  and recomputed at redeem time to look the row up. A plain hash (no
 *  salt) is fine here: the input is already 256 bits of randomness, so
 *  there's nothing to brute-force. */
export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Login throttling (in-process)                                       */
/* ------------------------------------------------------------------ */

/**
 * Brute-force limits, counted against FAILED attempts only — the same
 * scheme the Engineering login uses (lib/domain-auth.ts).
 *
 * The old gate charged every attempt, successes included, and never
 * cleared the per-IP bucket: the whole office signs in from one NAT
 * address, so twenty ordinary sign-ins in fifteen minutes locked everyone
 * out. Now the check only peeks, and a hit is spent when an attempt fails.
 *
 * In-memory (lib/rate-limit.ts): fine for one app container, needs Redis
 * once there is more than one.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_EMAIL = 5;
const LOGIN_MAX_PER_IP = 50;

/** The bucket a person's lockout lives in. Exported so a password reset
 *  can clear it under the same name. */
export function loginRateKey(identifier: string): string {
  return `login:em:${identifier.trim().toLowerCase()}`;
}

function loginIpKey(ip: string): string {
  return `login:ip:${ip}`;
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
  // brute-force run either. Peek only: a hit is charged on failure.
  const emailKey = loginRateKey(q);
  const ipKey = ip ? loginIpKey(ip) : null;
  const byEmail = peekRateLimit(emailKey, LOGIN_MAX_PER_EMAIL);
  const byIp = ipKey
    ? peekRateLimit(ipKey, LOGIN_MAX_PER_IP)
    : { ok: true, retryInSec: 0 };
  const locked = !byEmail.ok ? byEmail : byIp;
  if (!locked.ok) {
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(locked.retryInSec / 60)} min.`,
    };
  }
  /** One failed attempt: charged to the account and to the address. */
  const chargeFailure = () => {
    rateLimit(emailKey, LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW_MS);
    if (ipKey) rateLimit(ipKey, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
  };

  /**
   * Match by email exact, OR by full name, OR by first-name prefix.
   *
   * The name comparison happens in JS rather than through Prisma's
   * `mode: "insensitive"`, which is Postgres-only: against the SQLite dev
   * database that argument makes the entire sign-in throw, so nobody can
   * log in locally at all. lib/domain-auth.ts matches names the same way,
   * for the same reason.
   *
   * The email lookup stays in SQL — it is unique and indexed, so the
   * common case never reads the table. Only an identifier that is not a
   * known email falls through to the scan, and the user table is small
   * enough for that to cost nothing.
   */
  let user = await prisma.user.findUnique({ where: { email: q } });
  if (!user) {
    const everyone = await prisma.user.findMany();
    user =
      everyone.find((u) => {
        const name = u.name.trim().toLowerCase();
        return (
          u.email.trim().toLowerCase() === q ||
          name === q ||
          name.startsWith(q + " ")
        );
      }) ?? null;
  }
  // Single generic error for "no such user", "wrong password", and
  // "deactivated" — leaks no information about which accounts exist.
  const GENERIC = "Wrong account or password.";
  // API service accounts authenticate with bearer tokens on /api/v1 only.
  if (!user || !user.isActive || user.isServiceAccount) {
    chargeFailure();
    return { ok: false, error: GENERIC };
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    chargeFailure();
    return { ok: false, error: GENERIC };
  }

  // Success — clear this account's throttle bucket. The per-IP bucket is
  // left alone: it only ever counts failures, so it can't lock out the
  // office, and clearing it would let one good login wipe an attack's count.
  clearRateLimit(emailKey);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(user.id);

  return { ok: true, user: toSessionUser(user) };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .delete({ where: { id: hashSessionToken(token) } })
      .catch(() => null);
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
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  // The table stores only the token's hash — see lib/session-token.ts.
  const sid = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: sid } }).catch(() => null);
    return null;
  }
  if (!session.user.isActive || session.user.isServiceAccount) return null;
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
  // Retire every session issued under the old password — a password is
  // usually changed because it might be known to someone else, and their
  // session would otherwise outlive it for up to 30 days. This device gets
  // a fresh session so it isn't signed out mid-action (same as the
  // Engineering login, lib/domain-auth.ts changeDomainPassword).
  await revokeAllSessions(current.id);
  await createSession(current.id);
  return { ok: true };
}

/* ------------------------------------------------------------------ */

/** Sign this account out everywhere. Used on any password change —
 *  self-service, admin reset, or a reset link. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

/** Sign this account out everywhere except the browser making this
 *  request (if it is signed in as that account). For an admin setting a
 *  password: the target loses every session, and an admin resetting their
 *  own password from the Users page isn't signed out mid-action. */
export async function revokeOtherSessions(userId: string): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? hashSessionToken(token) : null;
  const { count } = await prisma.session.deleteMany({
    where: keep ? { userId, NOT: { id: keep } } : { userId },
  });
  return count;
}

async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  // The cookie carries the token; the row stores only its hash.
  const token = newSessionToken();
  await prisma.session.create({
    data: { id: hashSessionToken(token), userId, expiresAt },
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
  jar.set(SESSION_COOKIE, token, {
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
  canAssignAnyone?: boolean;
}): SessionUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: accessRole(u.primaryRole as Role),
    primaryRole: u.primaryRole as Role,
    isAdmin: u.isAdmin,
    canAssignAnyone: !!u.canAssignAnyone,
  };
}
