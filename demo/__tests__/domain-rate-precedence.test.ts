import { describe, it, expect } from "vitest";
import { effectiveRate, personalRate } from "@/lib/forecast";

/**
 * A rate somebody set beats a rate we measured. Always.
 *
 * The order is:
 *   1. set on this booking — "on THIS project, expect 100/day"
 *   2. set on the person   — what they were signed up at
 *   3. measured            — only when nobody has said
 *
 * Measurement used to sit second, so a set figure was overruled the
 * moment there was any approved history at all: set an Actionee at
 * 100/day, have them deliver a 1,000-tag batch on one date, and every
 * projection they touched switched to 1,000/day. The plan abandoned the
 * number a Lead had given it in favour of one nobody could sustain.
 *
 * The chain itself lives in projectForecasts and resourceForecasts, which
 * both need a database. What is pinned here is the rule they implement,
 * written the same way both do it — so a future edit that flips the order
 * back has to delete a test that says why not to.
 */

/** The forecast's chain, exactly as lib/domain-forecast.ts writes it. */
function planningRate(opts: {
  bookingRate?: number | null;
  personRate?: number | null;
  measured?: number | null;
}): number {
  const r =
    opts.bookingRate ?? opts.personRate ?? opts.measured ?? null;
  return effectiveRate(r);
}

describe("which rate a projection plans with", () => {
  it("uses the booking's rate over everything else", () => {
    expect(
      planningRate({ bookingRate: 100, personRate: 40, measured: 1000 }),
    ).toBe(100);
  });

  it("ignores a huge measured average when the person has a set rate", () => {
    // The exact case: 100/day set, a 1,000-tag day delivered.
    const measured = personalRate(1000, 1);
    expect(measured).toBe(1000);
    expect(planningRate({ personRate: 100, measured })).toBe(100);
  });

  it("ignores it on a per-project rate too", () => {
    expect(planningRate({ bookingRate: 100, measured: 1000 })).toBe(100);
  });

  it("still measures when nobody has set anything", () => {
    expect(planningRate({ measured: 22.5 })).toBe(22.5);
  });

  it("plans nothing when there is neither a set rate nor history", () => {
    expect(planningRate({})).toBe(0);
  });

  it("treats a stored zero as no capacity, not as 'unset'", () => {
    // The routes refuse 0, so this is defensive. If one ever got in, the
    // chain short-circuits on it (?? only skips null and undefined) and
    // the project reports nobody delivering — which is visible and gets
    // fixed. Reading it as "unset" would instead swap in a 1,000/day
    // measurement, which is invisible and does not.
    expect(planningRate({ personRate: 0, measured: 1000 })).toBe(0);
  });

  it("falls past a person's rate to measurement only when it is absent", () => {
    expect(planningRate({ personRate: null, measured: 30 })).toBe(30);
    expect(planningRate({ personRate: 40, measured: 30 })).toBe(40);
  });
});
