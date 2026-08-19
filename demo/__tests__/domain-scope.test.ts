import { describe, it, expect } from "vitest";
import { projectScope } from "@/lib/domain-scope";

/**
 * The worked example from the business:
 *
 *   contract 13508, received 10828, delivered 4857
 *   -> 2680 still with the client
 */

describe("projectScope", () => {
  it("derives what is still with the client", () => {
    const s = projectScope({
      contractTags: 13508,
      totalTags: 10828,
      deliveredTags: 4857,
    });
    expect(s.withClientTags).toBe(2680);
    expect(s.receivedTags).toBe(10828);
    expect(s.deliveredTags).toBe(4857);
    expect(s.outstandingTags).toBe(10828 - 4857);
  });

  it("measures delivery against what we hold, not against the contract", () => {
    // 4857/10828 = 45%, not 4857/13508 = 36%. Dividing by the contract
    // would make a team look behind for work nobody has released to them.
    const s = projectScope({
      contractTags: 13508,
      totalTags: 10828,
      deliveredTags: 4857,
    });
    expect(s.deliveredPct).toBe(45);
    expect(s.contractPct).toBe(36);
  });

  it("treats a missing contract as untracked, not as zero", () => {
    const s = projectScope({ contractTags: null, totalTags: 800, deliveredTags: 126 });
    expect(s.contractTags).toBeNull();
    expect(s.withClientTags).toBeNull();
    expect(s.contractPct).toBeNull();
    // Delivery still reports normally.
    expect(s.deliveredPct).toBe(16);
  });

  it("never reports a negative amount outstanding with the client", () => {
    // A contract figure that has not been updated after extra tags were
    // released. Clamped to zero and flagged rather than shown negative.
    const s = projectScope({ contractTags: 100, totalTags: 140, deliveredTags: 10 });
    expect(s.withClientTags).toBe(0);
    expect(s.receivedExceedsContract).toBe(true);
  });

  it("does not flag the ordinary case", () => {
    const s = projectScope({ contractTags: 200, totalTags: 200, deliveredTags: 0 });
    expect(s.receivedExceedsContract).toBe(false);
    expect(s.withClientTags).toBe(0);
  });

  it("handles an empty project without dividing by zero", () => {
    const s = projectScope({ contractTags: null, totalTags: 0, deliveredTags: 0 });
    expect(s.deliveredPct).toBe(0);
    expect(s.outstandingTags).toBe(0);
    expect(s.contractPct).toBeNull();
  });

  it("ignores negative input rather than propagating it", () => {
    const s = projectScope({ contractTags: -5, totalTags: -10, deliveredTags: -1 });
    expect(s.contractTags).toBe(0);
    expect(s.receivedTags).toBe(0);
    expect(s.deliveredTags).toBe(0);
    expect(s.withClientTags).toBe(0);
  });
});
