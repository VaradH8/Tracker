import { describe, it, expect } from "vitest";
import { newResetToken, hashResetToken } from "@/lib/auth";

describe("password-reset token helpers", () => {
  it("newResetToken is high-entropy and url-safe", () => {
    const t = newResetToken();
    // 32 random bytes → 43 base64url chars, no +/= or slashes to break URLs.
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("newResetToken does not repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newResetToken());
    expect(seen.size).toBe(1000);
  });

  it("hashResetToken is deterministic and hides the raw token", () => {
    const raw = newResetToken();
    const h1 = hashResetToken(raw);
    const h2 = hashResetToken(raw);
    expect(h1).toBe(h2); // same input → same stored id
    expect(h1).not.toBe(raw); // the stored value is not the usable secret
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
  });

  it("different tokens hash to different ids", () => {
    expect(hashResetToken(newResetToken())).not.toBe(
      hashResetToken(newResetToken()),
    );
  });
});
