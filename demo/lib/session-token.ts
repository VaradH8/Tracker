import { createHash, randomBytes } from "node:crypto";

/**
 * Session tokens for both the tracker and the Engineering login.
 *
 * The cookie holds a 256-bit random token; the database holds only its
 * SHA-256. Anyone who reads the Session table (or a backup of it) gets
 * hashes they cannot present as a cookie. A plain, unsalted hash is right
 * here for the same reason as reset tokens (lib/auth.ts hashResetToken):
 * the input is already 256 bits of randomness, so there is nothing to
 * brute-force.
 *
 * Sessions minted before this change had a cuid as both cookie and id;
 * migration 20261116000000_hash_session_ids hashed those ids in place, so
 * an old cookie still resolves through the same `hashSessionToken` lookup.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
