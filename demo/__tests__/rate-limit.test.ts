import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __resetRateLimits } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows up to max hits, then blocks", () => {
    const key = "k1";
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryInSec).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000);
    expect(rateLimit("a", 5, 60_000).ok).toBe(false);
    expect(rateLimit("b", 5, 60_000).ok).toBe(true);
  });

  it("rolls over after the window expires", () => {
    const key = "k2";
    for (let i = 0; i < 5; i++) rateLimit(key, 5, -1); // window already past
    // With a non-positive window every call starts a fresh bucket, so it
    // never latches into the blocked state.
    expect(rateLimit(key, 5, -1).ok).toBe(true);
  });
});
