import { describe, it, expect } from "vitest";
import {
  handoverFrom,
  isWeekend,
  isWorkingDay,
  workingDaysBetween,
  isWorkWeek,
  MAX_WORKING_DAYS,
} from "@/lib/domain-workdays";

/**
 * Handover dates are quoted to clients, so the rules that matter are the
 * ones that decide whether a promise is kept:
 *
 *   - one working day starting Monday finishes that Monday. Off-by-one
 *     here ships every project a day early or late.
 *   - a six-day week works Saturdays; only Sunday is always off.
 *   - a holiday pushes the date out, but only when it lands on a day that
 *     would otherwise have been worked.
 */

// Reference days, all 2026: 17 Aug is a Monday, 22 Aug a Saturday,
// 23 Aug a Sunday.
const MON = "2026-08-17";
const SAT = "2026-08-22";
const SUN = "2026-08-23";

describe("weekends", () => {
  it("Sunday is off on both a five- and six-day week", () => {
    expect(isWeekend(SUN, 5)).toBe(true);
    expect(isWeekend(SUN, 6)).toBe(true);
  });

  it("Saturday is off only on a five-day week", () => {
    expect(isWeekend(SAT, 5)).toBe(true);
    expect(isWeekend(SAT, 6)).toBe(false);
  });

  it("a holiday makes an ordinary weekday non-working", () => {
    const holidays = new Set([MON]);
    expect(isWorkingDay(MON, 5, new Set())).toBe(true);
    expect(isWorkingDay(MON, 5, holidays)).toBe(false);
  });
});

describe("handoverFrom", () => {
  it("one working day from a Monday lands on that Monday", () => {
    // The whole calculation hangs off this: `total` counts the start day
    // when it is workable, so 1 day of work starting Monday ends Monday.
    expect(handoverFrom(MON, 1, 5)?.handover).toBe(MON);
  });

  it("five days from Monday lands on Friday, not the next Monday", () => {
    expect(handoverFrom(MON, 5, 5)?.handover).toBe("2026-08-21");
  });

  it("six days from Monday skips the weekend on a five-day week", () => {
    const r = handoverFrom(MON, 6, 5);
    expect(r?.handover).toBe("2026-08-24"); // the following Monday
    expect(r?.weekendsSkipped).toBe(2);
  });

  it("six days from Monday ends on Saturday when Saturdays are worked", () => {
    const r = handoverFrom(MON, 6, 6);
    expect(r?.handover).toBe(SAT);
    expect(r?.weekendsSkipped).toBe(0);
  });

  it("counts a holiday only when it displaces work", () => {
    // Wednesday 19 Aug is a working day, so this pushes the finish out.
    const r = handoverFrom(MON, 5, 5, new Set(["2026-08-19"]));
    expect(r?.handover).toBe("2026-08-24");
    expect(r?.holidaysSkipped).toBe(1);
  });

  it("ignores a holiday that falls on a weekend", () => {
    // A holiday on Sunday costs nobody a working day, so it must not be
    // reported as one — the date is unchanged either way.
    const plain = handoverFrom(MON, 6, 5);
    const withSundayHoliday = handoverFrom(MON, 6, 5, new Set([SUN]));
    expect(withSundayHoliday?.handover).toBe(plain?.handover);
    expect(withSundayHoliday?.holidaysSkipped).toBe(0);
  });

  it("a Saturday holiday costs a day on a six-day week but not a five-day one", () => {
    const five = handoverFrom(MON, 6, 5, new Set([SAT]));
    const six = handoverFrom(MON, 6, 6, new Set([SAT]));
    expect(five?.holidaysSkipped).toBe(0);
    expect(six?.holidaysSkipped).toBe(1);
    expect(six?.handover).toBe("2026-08-24"); // pushed to Monday
  });

  it("starting on a weekend begins counting from the next working day", () => {
    const r = handoverFrom(SAT, 1, 5);
    expect(r?.firstWorkingDay).toBe("2026-08-24");
    expect(r?.handover).toBe("2026-08-24");
  });

  it("crosses a month and a year boundary correctly", () => {
    // 30 Dec 2026 is a Wednesday; three working days spans into January.
    const r = handoverFrom("2026-12-30", 3, 5);
    expect(r?.handover).toBe("2027-01-01");
  });

  it("a long run skips the right number of weekend days", () => {
    // 60 working days on a five-day week is 12 working weeks, Mon 17 Aug
    // to Fri 6 Nov. That span contains 11 weekends, not 12: counting
    // stops on the final Friday, so the weekend after it is never
    // crossed. 11 x 2 = 22.
    const r = handoverFrom(MON, 60, 5);
    expect(r?.handover).toBe("2026-11-06");
    expect(r?.weekendsSkipped).toBe(22);
  });

  it("rejects input it cannot answer instead of guessing", () => {
    expect(handoverFrom("not-a-date", 5, 5)).toBeNull();
    expect(handoverFrom("2026-02-30", 5, 5)).toBeNull(); // no such day
    expect(handoverFrom(MON, 0, 5)).toBeNull();
    expect(handoverFrom(MON, -3, 5)).toBeNull();
    expect(handoverFrom(MON, 2.5, 5)).toBeNull();
    expect(handoverFrom(MON, MAX_WORKING_DAYS + 1, 5)).toBeNull();
  });

  it("terminates on a pathological holiday list instead of hanging", () => {
    // Every day for the next 11 years marked as a holiday. The guarantee
    // is that the call returns — either an answer past the blocked
    // stretch, or null once the bound is hit. What must never happen is
    // an unbounded loop holding a request open.
    const everyDay = new Set<string>();
    const d = new Date("2026-08-17T00:00:00Z");
    for (let i = 0; i < 4000; i += 1) {
      everyDay.add(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const started = Date.now();
    const r = handoverFrom(MON, 4000, 5, everyDay);
    expect(Date.now() - started).toBeLessThan(2000);
    // Whatever it returns must be self-consistent, never a partial answer.
    if (r !== null) {
      expect(r.handover >= r.firstWorkingDay).toBe(true);
      expect(everyDay.has(r.handover)).toBe(false);
    }
  });
});

describe("workingDaysBetween", () => {
  it("is inclusive of both ends", () => {
    expect(workingDaysBetween(MON, "2026-08-21", 5)).toBe(5);
  });

  it("excludes weekends and holidays", () => {
    expect(workingDaysBetween(MON, "2026-08-24", 5)).toBe(6);
    expect(workingDaysBetween(MON, "2026-08-24", 5, new Set(["2026-08-19"]))).toBe(5);
  });

  it("counts Saturdays on a six-day week", () => {
    expect(workingDaysBetween(MON, "2026-08-23", 6)).toBe(6);
    expect(workingDaysBetween(MON, "2026-08-23", 5)).toBe(5);
  });

  it("returns 0 when the end precedes the start", () => {
    expect(workingDaysBetween("2026-08-21", MON, 5)).toBe(0);
  });

  it("round-trips with handoverFrom", () => {
    // If 40 working days ends on a date, that span must measure 40.
    const r = handoverFrom(MON, 40, 5)!;
    expect(workingDaysBetween(r.firstWorkingDay, r.handover, 5)).toBe(40);
  });
});

describe("isWorkWeek", () => {
  it("accepts only the weeks the system supports", () => {
    expect(isWorkWeek(5)).toBe(true);
    expect(isWorkWeek(6)).toBe(true);
    expect(isWorkWeek(7)).toBe(false);
    expect(isWorkWeek("5")).toBe(false);
    expect(isWorkWeek(null)).toBe(false);
  });
});
