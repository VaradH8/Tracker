import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Optional guard on creating the very first admin.
 *
 * Both modules let whoever arrives first on an EMPTY user table make
 * themselves Admin (Tracker: POST /api/auth/signup, Engineering: POST
 * /api/domain/auth/bootstrap). That is how a fresh deployment gets its
 * first account — and also means a stranger who reaches a fresh or wiped
 * deployment before you do owns it.
 *
 * Set SETUP_TOKEN in the environment and the first-admin form also asks
 * for that value. Leave it unset and nothing changes. Once a module has
 * users, its bootstrap is closed regardless.
 */
function configured(): string | null {
  const v = process.env.SETUP_TOKEN?.trim();
  return v ? v : null;
}

export function setupTokenRequired(): boolean {
  return configured() !== null;
}

/** True when no token is configured, or `given` matches it. Compared in
 *  constant time over fixed-length digests. */
export function setupTokenOk(given: unknown): boolean {
  const want = configured();
  if (!want) return true;
  if (typeof given !== "string" || !given) return false;
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(want).digest();
  return timingSafeEqual(a, b);
}
