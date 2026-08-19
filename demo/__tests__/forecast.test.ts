import { describe, it, expect } from "vitest";
import {
  availableFrom,
  effectiveRate,
  forecastDelivery,
  isWorkingDay,
  nextWorkingDay,
  nthWorkingDay,
  personalRate,
  rangesOverlap,
  splitRate,
  toISODate,
  workingDaysBetween,
} from "@/lib/forecast";

/** Dates in these tests are UTC midnight so the day key is unambiguous.
 *  2026-08-10 is a Monday, 2026-08-15 a Saturday. */
const d = (iso: string) => new Date(iso + "T00:00:00.000Z");

describe("working-day arithmetic", () => {
  it("counts Mon–Fri as working days and the weekend as not", () => {
    expect(isWorkingDay(d("2026-08-10"))).toBe(true); // Mon
    expect(isWorkingDay(d("2026-08-14"))).toBe(true); // Fri
    expect(isWorkingDay(d("2026-08-15"))).toBe(false); // Sat
    expect(isWorkingDay(d("2026-08-16"))).toBe(false); // Sun
  });

  it("counts the start day itself as the first working day", () => {
    expect(toISODate(nthWorkingDay(d("2026-08-10"), 1))).toBe("2026-08-10");
  });

  it("skips the weekend when counting forward", () => {
    // Mon + 5 working days lands on the Friday, not the Sunday.
    expect(toISODate(nthWorkingDay(d("2026-08-10"), 5))).toBe("2026-08-14");
    // The 6th working day rolls into the next Monday.
    expect(toISODate(nthWorkingDay(d("2026-08-10"), 6))).toBe("2026-08-17");
  });

  it("moves a weekend start to the following Monday", () => {
    expect(toISODate(nextWorkingDay(d("2026-08-15")))).toBe("2026-08-17");
    expect(toISODate(nextWorkingDay(d("2026-08-10")))).toBe("2026-08-10");
  });

  it("measures an inclusive working-day span", () => {
    expect(workingDaysBetween(d("2026-08-10"), d("2026-08-14"))).toBe(5);
    expect(workingDaysBetween(d("2026-08-10"), d("2026-08-10"))).toBe(1);
    // Spanning the weekend: Mon–Mon is 6 working days, not 8 calendar.
    expect(workingDaysBetween(d("2026-08-10"), d("2026-08-17"))).toBe(6);
  });

  it("returns a negative span when the end precedes the start", () => {
    expect(workingDaysBetween(d("2026-08-14"), d("2026-08-10"))).toBe(-5);
  });
});

describe("personalRate", () => {
  it("divides approved tags by the days actually worked", () => {
    expect(personalRate(40, 4)).toBe(10);
    expect(personalRate(70, 7)).toBe(10);
  });

  it("rounds to two decimals", () => {
    expect(personalRate(10, 3)).toBe(3.33);
  });

  it("returns null with no history to go on", () => {
    expect(personalRate(0, 0)).toBeNull();
    expect(personalRate(0, 5)).toBeNull();
    expect(personalRate(20, 0)).toBeNull();
  });

  it("plans nobody at an invented rate — no rate means no contribution", () => {
    // There used to be a house default of 8/day here. It made a project
    // staffed entirely by people nobody had measured look like it had a
    // credible delivery date, which is the most expensive kind of wrong.
    expect(effectiveRate(null)).toBe(0);
    expect(effectiveRate(undefined)).toBe(0);
    expect(effectiveRate(0)).toBe(0);
    expect(effectiveRate(12)).toBe(12);
  });
});

describe("splitRate", () => {
  it("leaves an undivided person alone", () => {
    expect(splitRate(20, 1)).toBe(20);
    expect(splitRate(20, 0)).toBe(20);
  });

  it("halves someone booked on two projects at once", () => {
    expect(splitRate(20, 2)).toBe(10);
  });

  it("splits evenly across three and rounds to two decimals", () => {
    expect(splitRate(10, 3)).toBe(3.33);
  });

  it("never lets parallel projects each claim the whole person", () => {
    // The point of the split: the shares add back up to one person's day,
    // rather than to N times it.
    const full = 30;
    for (const n of [2, 3, 4, 5]) {
      expect(splitRate(full, n) * n).toBeCloseTo(full, 1);
    }
  });
});

describe("forecastDelivery", () => {
  it("adds up the rates of everyone allocated", () => {
    const r = forecastDelivery({
      remainingTags: 100,
      rates: [10, 5, 5],
      from: d("2026-08-10"),
      handoverDate: d("2026-08-31"),
    });
    expect(r.dailyRate).toBe(20);
    expect(r.workingDaysNeeded).toBe(5);
  });

  it("projects the finish date in working days and reports slack", () => {
    // 100 tags at 20/day = 5 working days from Mon 10th -> Fri 14th.
    const r = forecastDelivery({
      remainingTags: 100,
      rates: [20],
      from: d("2026-08-10"),
      handoverDate: d("2026-08-21"),
    });
    expect(r.projectedDate).toBe("2026-08-14");
    expect(r.status).toBe("On Track");
    // Fri 14th -> Fri 21st inclusive is 6 working days, so 5 spare.
    expect(r.slackDays).toBe(5);
  });

  it("rounds a part-day of work up to a whole day", () => {
    const r = forecastDelivery({
      remainingTags: 101,
      rates: [20],
      from: d("2026-08-10"),
      handoverDate: null,
    });
    expect(r.workingDaysNeeded).toBe(6);
  });

  it("flags Behind Schedule when the projection overruns handover", () => {
    // 200 tags at 10/day = 20 working days — well past a 5-day window.
    const r = forecastDelivery({
      remainingTags: 200,
      rates: [10],
      from: d("2026-08-10"),
      handoverDate: d("2026-08-14"),
    });
    expect(r.status).toBe("Behind Schedule");
    expect(r.slackDays).toBeLessThan(0);
    expect(r.reason).toMatch(/overruns/);
  });

  it("treats landing exactly on the handover date as on track", () => {
    const r = forecastDelivery({
      remainingTags: 100,
      rates: [20],
      from: d("2026-08-10"),
      handoverDate: d("2026-08-14"),
    });
    expect(r.projectedDate).toBe("2026-08-14");
    expect(r.status).toBe("On Track");
    expect(r.slackDays).toBe(0);
  });

  it("is On Track with nothing left to deliver", () => {
    const r = forecastDelivery({
      remainingTags: 0,
      rates: [],
      from: d("2026-08-10"),
      handoverDate: d("2026-08-14"),
    });
    expect(r.status).toBe("On Track");
    expect(r.workingDaysNeeded).toBe(0);
  });

  it("refuses to invent a date when nobody is allocated", () => {
    const r = forecastDelivery({
      remainingTags: 50,
      rates: [],
      from: d("2026-08-10"),
      handoverDate: d("2026-08-14"),
    });
    expect(r.projectedDate).toBeNull();
    expect(r.status).toBe("Behind Schedule");
    expect(r.reason).toMatch(/No resources/);
  });

  it("returns Unknown when the project has no handover date", () => {
    const r = forecastDelivery({
      remainingTags: 50,
      rates: [10],
      from: d("2026-08-10"),
      handoverDate: null,
    });
    expect(r.status).toBe("Unknown");
    expect(r.slackDays).toBeNull();
    expect(r.projectedDate).toBe("2026-08-14");
  });

  it("starts from the next working day when asked on a weekend", () => {
    // Sat 15th: 20 tags at 20/day is one day's work, landing Mon 17th.
    const r = forecastDelivery({
      remainingTags: 20,
      rates: [20],
      from: d("2026-08-15"),
      handoverDate: null,
    });
    expect(r.projectedDate).toBe("2026-08-17");
  });
});

describe("rangesOverlap", () => {
  it("detects an overlap in either direction", () => {
    expect(
      rangesOverlap(d("2026-08-10"), d("2026-08-20"), d("2026-08-15"), d("2026-08-25")),
    ).toBe(true);
    expect(
      rangesOverlap(d("2026-08-15"), d("2026-08-25"), d("2026-08-10"), d("2026-08-20")),
    ).toBe(true);
  });

  it("counts a shared boundary day as an overlap", () => {
    expect(
      rangesOverlap(d("2026-08-10"), d("2026-08-15"), d("2026-08-15"), d("2026-08-20")),
    ).toBe(true);
  });

  it("returns false for windows that don't touch", () => {
    expect(
      rangesOverlap(d("2026-08-10"), d("2026-08-14"), d("2026-08-17"), d("2026-08-20")),
    ).toBe(false);
  });
});

describe("availableFrom", () => {
  it("is null — free now — when the person holds no allocations", () => {
    expect(availableFrom([])).toBeNull();
  });

  it("frees the person the working day after their last commitment", () => {
    const free = availableFrom([
      { endDate: d("2026-08-14"), releasedAt: null },
      { endDate: d("2026-08-12"), releasedAt: null },
    ]);
    // Fri 14th ends the run, so Mon 17th is the first free working day.
    expect(toISODate(free!)).toBe("2026-08-17");
  });

  it("honours an early release over the booked end date", () => {
    const free = availableFrom([
      { endDate: d("2026-08-28"), releasedAt: d("2026-08-13") },
    ]);
    expect(toISODate(free!)).toBe("2026-08-14");
  });
});
