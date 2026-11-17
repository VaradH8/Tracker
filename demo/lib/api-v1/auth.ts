/**
 * Bearer-token auth for /api/v1 service accounts (C-2, S-6).
 *
 * Tokens look like `trk_<43 url-safe chars>`. Only the SHA-256 is stored,
 * so a database leak does not leak usable tokens. A request is let in only
 * when the token exists, is not revoked, and belongs to an ACTIVE service
 * account — deactivating the account (or revoking the token) is the kill
 * switch and takes effect on the very next request.
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export type ApiUser = {
  id: string;
  name: string;
  email: string;
};

export type ApiAuth = { user: ApiUser; tokenId: number };

export const TOKEN_PREFIX = "trk_";

export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newApiToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export type AuthFailure = { code: string; message: string };

export async function authenticateBearer(
  header: string | null,
): Promise<ApiAuth | AuthFailure> {
  const m = header?.match(/^Bearer\s+(\S+)\s*$/i);
  if (!m) return { code: "unauthorized", message: "Missing bearer token" };
  const raw = m[1];
  if (!raw.startsWith(TOKEN_PREFIX)) {
    return { code: "unauthorized", message: "Invalid token" };
  }
  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(raw) },
    include: { user: true },
  });
  if (!token || token.revokedAt) {
    return { code: "unauthorized", message: "Invalid or revoked token" };
  }
  if (!token.user.isServiceAccount) {
    return { code: "unauthorized", message: "Token is not for a service account" };
  }
  if (!token.user.isActive) {
    return { code: "account_disabled", message: "This service account is disabled" };
  }
  touchToken(token.id);
  return {
    tokenId: token.id,
    user: { id: token.user.id, name: token.user.name, email: token.user.email },
  };
}

// lastUsedAt is informational; write it at most once a minute per token so
// a busy agent doesn't turn every read into a write.
const LAST_TOUCH = new Map<number, number>();
function touchToken(id: number) {
  const now = Date.now();
  if ((LAST_TOUCH.get(id) ?? 0) > now - 60_000) return;
  LAST_TOUCH.set(id, now);
  prisma.apiToken
    .update({ where: { id }, data: { lastUsedAt: new Date(now) } })
    .catch(() => null);
}

/**
 * Find or create the service-account user. It gets the least-privileged
 * role (Developer) for anything that ever looks at primaryRole, and a
 * random password nobody knows — signIn refuses service accounts anyway.
 */
export async function ensureServiceAccount(opts: {
  name: string;
  email: string;
}): Promise<{ id: string; created: boolean }> {
  const email = opts.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isServiceAccount) {
      throw new Error(
        `${email} already belongs to a person's account; pick another email for the service account.`,
      );
    }
    return { id: existing.id, created: false };
  }
  const user = await prisma.user.create({
    data: {
      email,
      name: opts.name.trim(),
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      primaryRole: "Developer",
      isAdmin: false,
      isActive: true,
      isServiceAccount: true,
      capacityPerWeek: 0,
    },
  });
  return { id: user.id, created: true };
}

/** Issue a new token. Returns the raw value — show it once, never store it. */
export async function issueApiToken(opts: {
  userId: string;
  name: string;
  createdById?: string | null;
}): Promise<{ id: number; token: string; prefix: string }> {
  const token = newApiToken();
  const prefix = token.slice(0, 12);
  const row = await prisma.apiToken.create({
    data: {
      userId: opts.userId,
      name: opts.name,
      tokenHash: hashApiToken(token),
      prefix,
      createdById: opts.createdById ?? null,
    },
  });
  return { id: row.id, token, prefix };
}
