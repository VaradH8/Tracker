import { describe, it, expect } from "vitest";
import {
  HOURS_PER_DAY,
  MAX_HOURS_SPENT,
  budgetedHours,
  daySpan,
  weekendLabel,
  hoursSpentIssue,
  hoursVariance,
  parseHoursSpent,
} from "@/lib/domain-task-hours";

/**
 * Nine hours a working day, counted as the gap between the two dates.
 *
 * Assigned Monday, due Thursday is three days and twenty-seven hours —
 * that is the arithmetic people quote, and it is a subtraction away from
 * workingDaysBetween, which counts both ends.
 *
 * Weekends never count. A task handed out on Friday and due Monday is one
 * day's work; counting the calendar would quietly promise a Saturday.
 */

// 2026-08-24 is a Monday.
const MON = "2026-08-24";
const TUE = "2026-08-25";
const THU = "2026-08-27";
const FRI = "2026-08-28";
const NEXT_MON = "2026-08-31";

describe("what a task is worth", () => {
  it("is 27 hours for a task due three days later", () => {
    // The example this was specified with.
    expect(budgetedHours(MON, THU)).toBe(27);
  });

  it("is one day for a task assigned and due the same day", () => {
    // The gap is zero, but a day's work is not zero hours.
    expect(budgetedHours(MON, MON)).toBe(HOURS_PER_DAY);
  });

  it("is one day from one date to the next", () => {
    expect(budgetedHours(MON, TUE)).toBe(9);
  });

  it("does not pay for the weekend", () => {
    // Friday to Monday is one working day between them, not three.
    expect(budgetedHours(FRI, NEXT_MON)).toBe(9);
  });

  it("counts a full working week as five days", () => {
    // Monday to the next Monday: Mon–Fri plus the Monday, gap of five.
    expect(budgetedHours(MON, NEXT_MON)).toBe(5 * HOURS_PER_DAY);
  });

  it("says nothing when it has nothing to go on", () => {
    expect(budgetedHours(null, THU)).toBeNull();
    expect(budgetedHours(MON, null)).toBeNull();
    expect(budgetedHours("nonsense", THU)).toBeNull();
  });

  it("refuses a due date before the assign date", () => {
    // Negative hours would be worse than no figure.
    expect(budgetedHours(THU, MON)).toBeNull();
  });

  it("takes Dates as readily as strings", () => {
    expect(budgetedHours(new Date(`${MON}T00:00:00Z`), new Date(`${THU}T00:00:00Z`))).toBe(27);
  });
});

describe("hours somebody reports", () => {
  it("accepts an ordinary figure", () => {
    for (const h of [0.25, 2, 7.5, 40, MAX_HOURS_SPENT]) {
      expect(hoursSpentIssue(h)).toBeNull();
    }
  });

  it("accepts nothing at all", () => {
    // Optional: refusing a submission for want of a number would only
    // teach people to type one in.
    expect(hoursSpentIssue(undefined)).toBeNull();
    expect(hoursSpentIssue(null)).toBeNull();
    expect(hoursSpentIssue("")).toBeNull();
    expect(parseHoursSpent("")).toBeNull();
  });

  it("refuses zero, negatives and nonsense", () => {
    expect(hoursSpentIssue(0)).toBeTruthy();
    expect(hoursSpentIssue(-3)).toBeTruthy();
    expect(hoursSpentIssue("abc")).toBeTruthy();
  });

  it("catches a slipped decimal point", () => {
    expect(hoursSpentIssue(9000)).toMatch(/typo/i);
  });

  it("holds people to quarter hours", () => {
    expect(hoursSpentIssue(2.5)).toBeNull();
    expect(hoursSpentIssue(2.3)).toMatch(/quarter/i);
  });

  it("rounds what it stores", () => {
    expect(parseHoursSpent("7.5")).toBe(7.5);
    expect(parseHoursSpent(7)).toBe(7);
  });
});

describe("budget against actual", () => {
  it("reports coming in under", () => {
    expect(hoursVariance(27, 19)).toEqual({ over: false, by: 8 });
  });

  it("reports going over", () => {
    expect(hoursVariance(27, 34)).toEqual({ over: true, by: 7 });
  });

  it("reports landing exactly", () => {
    expect(hoursVariance(27, 27)).toEqual({ over: false, by: 0 });
  });

  it("says nothing when either half is missing", () => {
    // No budget, or nobody logged their hours — a comparison needs both.
    expect(hoursVariance(null, 19)).toBeNull();
    expect(hoursVariance(27, null)).toBeNull();
  });
});

describe("weekends in the middle of a task", () => {
  // 2026-08-28 is a Friday; 29 Sat, 30 Sun, 31 Mon.
  const FRI = "2026-08-28";
  const MON = "2026-08-31";

  it("does not promise a Saturday by default", () => {
    // Friday to Monday is one working day — Monday. Counting the weekend
    // would hand somebody 27h of work they were never asked to be there
    // for.
    expect(budgetedHours(FRI, MON)).toBe(9);
  });

  it("counts the weekend when the assigner says it is being worked", () => {
    // Sat, Sun, Mon = 3 days.
    expect(budgetedHours(FRI, MON, true)).toBe(27);
  });

  it("names the weekend days so the form can show them", () => {
    const span = daySpan(FRI, MON);
    expect(span?.weekend).toEqual(["2026-08-29", "2026-08-30"]);
    expect(weekendLabel(span!.weekend)).toBe("Sat 29, Sun 30");
  });

  it("says nothing when the span is clear of a weekend", () => {
    // Mon 2026-08-31 to Thu 2026-09-03.
    const span = daySpan("2026-08-31", "2026-09-03");
    expect(span?.weekend).toEqual([]);
    // And the two figures agree, because there is nothing to disagree on.
    expect(budgetedHours("2026-08-31", "2026-09-03")).toBe(27);
    expect(budgetedHours("2026-08-31", "2026-09-03", true)).toBe(27);
  });

  it("keeps the old weekday arithmetic exactly as it was", () => {
    // The figure everybody quotes: Mon -> Thu is 27h. This is the case the
    // feature was built around and it must not have moved.
    expect(budgetedHours("2026-08-24", "2026-08-27")).toBe(27);
  });

  it("counts a fortnight's weekends, not just the first", () => {
    // Fri 28 Aug -> Fri 11 Sep crosses two weekends.
    const span = daySpan("2026-08-28", "2026-09-11");
    expect(span?.weekend).toHaveLength(4);
    expect(budgetedHours("2026-08-28", "2026-09-11")).toBe(10 * 9);
    expect(budgetedHours("2026-08-28", "2026-09-11", true)).toBe(14 * 9);
  });

  it("a weekend-only task is a day, not nothing", () => {
    // Fri -> Sun with weekends off has no working day in it. Zero hours
    // would be a nonsense to plan against; it means "fit it in".
    expect(budgetedHours("2026-08-28", "2026-08-30")).toBe(9);
    expect(budgetedHours("2026-08-28", "2026-08-30", true)).toBe(18);
  });

  it("same day is a day's work either way", () => {
    expect(budgetedHours(FRI, FRI)).toBe(9);
    expect(budgetedHours(FRI, FRI, true)).toBe(9);
  });

  it("refuses a due date before the assign date", () => {
    expect(budgetedHours(MON, FRI)).toBe(null);
    expect(daySpan(MON, FRI)).toBe(null);
  });

  it("hours can exist without dates at all", () => {
    // The form lets you type hours with no deadline. The suggestion just
    // has nothing to say, which is not the same as zero.
    expect(budgetedHours(null, null)).toBe(null);
    expect(budgetedHours(FRI, null)).toBe(null);
    expect(budgetedHours(null, MON)).toBe(null);
  });
});
