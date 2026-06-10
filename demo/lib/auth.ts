import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Role } from "./role";

const SESSION_COOKIE = "tracker_session";
const SESSION_DAYS = 30;
const PASSWORD_MIN = 6;

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

export async function signIn(
  emailOrUsername: string,
  password: string,
): Promise<SignInResult> {
  const q = emailOrUsername.trim().toLowerCase();
  if (!q || !password) {
    return { ok: false, error: "Enter your account and password." };
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
  if (!user) return { ok: false, error: "No account matches that name." };
  if (!user.isActive) {
    return { ok: false, error: "That account is deactivated." };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { ok: false, error: "Wrong password." };

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
  if (!input.password || input.password.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN} characters.`,
    };
  }

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
  if (!input.password || input.password.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN} characters.`,
    };
  }
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
  if (!nextPassword || nextPassword.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `New password must be at least ${PASSWORD_MIN} characters.`,
    };
  }
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
  // Don't set `secure: true` blindly in production — the app commonly runs
  // on http://<host>:3000 behind a reverse proxy that terminates TLS, or
  // straight HTTP for an internal demo. A secure-only cookie would be
  // rejected by the browser on plain HTTP and sign-in would fail silently.
  // Opt back in by exporting SESSION_COOKIE_SECURE=1 once the app sits
  // behind HTTPS end-to-end.
  jar.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "1",
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
