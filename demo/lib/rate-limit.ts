/**
 * Tiny fixed-window rate limiter, shared by the auth-adjacent routes
 * (forgot-password, domain sign-in) and the notifications endpoint.
 *
 * In-process only: the buckets live in this module's memory and reset
 * when the container restarts. That's acceptable for a single-instance
 * internal tool — the moment we run more than one app replica this needs
 * to move to Redis (or a shared table), same caveat as the login throttle
 * in lib/auth.ts. Keep the two consistent if you migrate one.
 */

type Bucket = { count: number; resetAt: number };

const BUCKETS = new Map<string, Bucket>();

// Opportunistic cleanup: drop expired buckets when the map gets large so
// a long-lived process doesn't accumulate a key per email/IP/actor seen.
const MAX_BUCKETS = 10_000;

function sweep(now: number) {
  if (BUCKETS.size < MAX_BUCKETS) return;
  for (const [key, b] of BUCKETS) {
    if (b.resetAt <= now) BUCKETS.delete(key);
  }
}

export type RateLimitResult = { ok: boolean; retryInSec: number };

/**
 * Count one hit against `key`. Returns `{ ok: false }` once more than
 * `max` hits land inside the rolling `windowMs`, until the window rolls
 * over. Fixed-window (not sliding) — good enough to blunt brute-force and
 * spam without added machinery.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryInSec: 0 };
  }
  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryInSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryInSec: 0 };
}

/**
 * Is this key already locked out, without spending a hit on asking?
 *
 * `rateLimit` both counts and judges, which is right when every call is a
 * thing you want to limit. It is wrong for a login: the check has to
 * happen before the password is known, so counting there counts the
 * successes too — five sign-ins in the window and the account locks
 * itself out. Peek first, and only spend a hit when the attempt actually
 * fails.
 */
export function peekRateLimit(key: string, max: number): RateLimitResult {
  const now = Date.now();
  const b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) return { ok: true, retryInSec: 0 };
  if (b.count > max) {
    return { ok: false, retryInSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryInSec: 0 };
}

/**
 * Forget everything counted against this key.
 *
 * A lockout has to be clearable by something, or it outlives the problem
 * it was protecting against. It is dropped when the credential is proved
 * (a successful sign-in), when it is changed (a password reset), and when
 * the account itself goes — buckets are keyed by email, so without the
 * last one, deleting somebody and re-adding them hands the new account
 * the old account's lockout.
 */
export function clearRateLimit(key: string) {
  BUCKETS.delete(key);
}

/** Test/maintenance helper — wipe all buckets. */
export function __resetRateLimits() {
  BUCKETS.clear();
}
