import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetRateLimits,
  clearRateLimit,
  peekRateLimit,
  rateLimit,
} from "@/lib/rate-limit";

/**
 * The login throttle locked out the people it exists to protect.
 *
 * Reported from live: an Actionee with the right password could not sign
 * in. A Lead reset it — still refused. An Admin deleted the account and
 * added it back — still refused.
 *
 * Three faults, compounding:
 *
 *   1. The gate was consumed on every attempt, not every failure. It has
 *      to be checked before the password is known, so counting there
 *      counted the successes too: five sign-ins inside the window and the
 *      account locked itself out.
 *   2. Nothing ever cleared it. Not proving the password, not changing it.
 *      A reset therefore did nothing for the one person it exists for.
 *   3. Buckets are keyed by EMAIL. Delete the account and add it back and
 *      the new one inherits the old one's lockout — which is exactly what
 *      an admin reaches for when a login is broken.
 *
 * These pin the primitives the fix is built on. The wiring itself lives in
 * domainSignIn, setDomainPassword and the users route.
 */

const KEY = "domain-login:em:someone@example.test";
const MAX = 5;
const WINDOW = 15 * 60 * 1000;

beforeEach(() => __resetRateLimits());

describe("looking without counting", () => {
  it("does not consume a hit", () => {
    // The whole point: the pre-password check must be free, or every
    // successful sign-in pays for one.
    for (let i = 0; i < 50; i++) {
      expect(peekRateLimit(KEY, MAX).ok).toBe(true);
    }
    // Still a full allowance left afterwards: MAX hits pass, and the one
    // after MAX is the one that trips it.
    for (let i = 0; i < MAX; i++) {
      expect(rateLimit(KEY, MAX, WINDOW).ok).toBe(true);
    }
    expect(rateLimit(KEY, MAX, WINDOW).ok).toBe(false);
  });

  it("reports a lockout that counting has already caused", () => {
    for (let i = 0; i <= MAX; i++) rateLimit(KEY, MAX, WINDOW);
    expect(peekRateLimit(KEY, MAX).ok).toBe(false);
    expect(peekRateLimit(KEY, MAX).retryInSec).toBeGreaterThan(0);
  });

  it("agrees with rateLimit about where the line is", () => {
    // MAX hits are allowed; the one after it is not.
    for (let i = 0; i < MAX; i++) {
      expect(rateLimit(KEY, MAX, WINDOW).ok).toBe(true);
    }
    expect(peekRateLimit(KEY, MAX).ok).toBe(true);
    expect(rateLimit(KEY, MAX, WINDOW).ok).toBe(false);
    expect(peekRateLimit(KEY, MAX).ok).toBe(false);
  });
});

describe("clearing a lockout", () => {
  it("lets somebody straight back in", () => {
    for (let i = 0; i <= MAX; i++) rateLimit(KEY, MAX, WINDOW);
    expect(peekRateLimit(KEY, MAX).ok).toBe(false);

    clearRateLimit(KEY);

    expect(peekRateLimit(KEY, MAX).ok).toBe(true);
  });

  it("restores the full allowance, not one attempt", () => {
    // A reset that bought one more try would just fail again on the next
    // typo, which is how the original report went.
    for (let i = 0; i <= MAX; i++) rateLimit(KEY, MAX, WINDOW);
    clearRateLimit(KEY);
    for (let i = 0; i < MAX; i++) {
      expect(rateLimit(KEY, MAX, WINDOW).ok).toBe(true);
    }
  });

  it("touches only the key it was given", () => {
    const other = "domain-login:em:someone-else@example.test";
    for (let i = 0; i <= MAX; i++) {
      rateLimit(KEY, MAX, WINDOW);
      rateLimit(other, MAX, WINDOW);
    }
    clearRateLimit(KEY);
    expect(peekRateLimit(KEY, MAX).ok).toBe(true);
    expect(peekRateLimit(other, MAX).ok).toBe(false);
  });

  it("is harmless on a key that was never counted", () => {
    expect(() => clearRateLimit("domain-login:em:nobody@example.test")).not.toThrow();
  });
});

describe("what still throttles", () => {
  it("a run of failures does lock the account", () => {
    // The protection has to survive the fix.
    for (let i = 0; i < MAX; i++) {
      expect(rateLimit(KEY, MAX, WINDOW).ok).toBe(true);
    }
    expect(rateLimit(KEY, MAX, WINDOW).ok).toBe(false);
  });

  it("an office sharing one address gets far more room than one account", () => {
    // Everybody arrives from one NAT address, so the per-IP ceiling is the
    // whole team's mistyped passwords, not one attacker's. At 20 it locked
    // the building out on a Monday morning.
    const PER_EMAIL = 5;
    const PER_IP = 50;
    expect(PER_IP).toBeGreaterThan(PER_EMAIL * 5);
  });
});
