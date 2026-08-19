import { describe, it, expect } from "vitest";
import { splitRate, effectiveRate, forecastDelivery } from "@/lib/forecast";

/**
 * "Use per-project rates as set".
 *
 * The rule this option encodes: a rate is shared between concurrent
 * projects only when it describes the whole person. A figure a Lead put
 * on one booking already describes that project, so sharing it applies
 * the same discount twice — and forces whoever set it to type 20 to mean
 * 10.
 *
 * The arithmetic lives in splitRate; what these tests pin is which
 * divisor each kind of rate gets, since that is the decision the option
 * actually makes.
 */

/** Mirrors the choice made in projectForecasts and the simulate route. */
function divisorFor(opts: {
  rateIsPerProject: boolean;
  concurrentProjects: number;
  usePerProjectRates: boolean;
}): number {
  return opts.usePerProjectRates && opts.rateIsPerProject
    ? 1
    : opts.concurrentProjects;
}

describe("splitRate", () => {
  it("divides evenly and rounds to two places", () => {
    expect(splitRate(10, 2)).toBe(5);
    expect(splitRate(10, 3)).toBe(3.33);
    expect(splitRate(7.5, 2)).toBe(3.75);
  });

  it("leaves an undivided rate alone", () => {
    expect(splitRate(10, 1)).toBe(10);
    expect(splitRate(10, 0)).toBe(10);
    expect(splitRate(10, -1)).toBe(10);
  });
});

describe("with the option OFF — today's behaviour, unchanged", () => {
  it("shares a per-project rate, which is the double-discount bug", () => {
    const d = divisorFor({
      rateIsPerProject: true,
      concurrentProjects: 2,
      usePerProjectRates: false,
    });
    expect(splitRate(10, d)).toBe(5);
  });

  it("shares a whole-person rate, which is correct", () => {
    const d = divisorFor({
      rateIsPerProject: false,
      concurrentProjects: 2,
      usePerProjectRates: false,
    });
    expect(splitRate(8, d)).toBe(4);
  });
});

describe("with the option ON", () => {
  it("uses a per-project rate exactly as set, however many projects", () => {
    for (const concurrent of [1, 2, 5]) {
      const d = divisorFor({
        rateIsPerProject: true,
        concurrentProjects: concurrent,
        usePerProjectRates: true,
      });
      expect(splitRate(10, d)).toBe(10);
    }
  });

  it("still shares a whole-person rate — the option is not 'stop sharing'", () => {
    // This is the part worth guarding. Exempting measured or default
    // rates as well would let two parallel projects each forecast as
    // though they had the person's entire day.
    const d = divisorFor({
      rateIsPerProject: false,
      concurrentProjects: 2,
      usePerProjectRates: true,
    });
    expect(splitRate(8, d)).toBe(4);
  });

  it("changes nothing for somebody on a single project", () => {
    for (const perProject of [true, false]) {
      const off = divisorFor({
        rateIsPerProject: perProject,
        concurrentProjects: 1,
        usePerProjectRates: false,
      });
      const on = divisorFor({
        rateIsPerProject: perProject,
        concurrentProjects: 1,
        usePerProjectRates: true,
      });
      expect(splitRate(10, off)).toBe(splitRate(10, on));
    }
  });
});

describe("people with no rate set", () => {
  it("contribute nothing, and the option does not change that", () => {
    // Sharing zero is still zero — but the point is that there is no
    // invented figure to share in the first place.
    expect(effectiveRate(null)).toBe(0);
    for (const usePerProjectRates of [false, true]) {
      const d = divisorFor({
        rateIsPerProject: false,
        concurrentProjects: 2,
        usePerProjectRates,
      });
      expect(splitRate(effectiveRate(null), d)).toBe(0);
    }
  });

  it("leave a project with no delivery date rather than a made-up one", () => {
    const r = forecastDelivery({
      remainingTags: 500,
      rates: [effectiveRate(null), effectiveRate(null)],
      from: new Date("2026-08-18T00:00:00Z"),
      handoverDate: new Date("2026-11-30T00:00:00Z"),
    });
    expect(r.dailyRate).toBe(0);
    expect(r.projectedDate).toBeNull();
    expect(r.reason).toMatch(/no delivery date/i);
  });

  it("still forecast normally once one person has a rate", () => {
    const r = forecastDelivery({
      remainingTags: 100,
      rates: [effectiveRate(null), effectiveRate(10)],
      from: new Date("2026-08-18T00:00:00Z"),
      handoverDate: new Date("2026-11-30T00:00:00Z"),
    });
    expect(r.dailyRate).toBe(10);
    expect(r.projectedDate).not.toBeNull();
  });
});
