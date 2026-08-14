import { describe, it, expect } from "vitest";
import { backdateFloorISO, istParts } from "@/lib/domain";

/**
 * The date window every dated entry has to sit inside: never ahead of
 * today, never earlier than the 1st of the current month.
 *
 * Regression cover for tag submissions, which accepted any parseable date
 * while work logs and task submissions both enforced the window. A count
 * dated years out still moved deliveredCount, but fell outside the
 * trailing window the delivery rate is measured over — so the project
 * read as delivered at a rate nothing could account for. A backdated one
 * reopened a month that had already been reported.
 */

/** The check the three write paths share. */
function dateIssue(chosen: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chosen)) return "malformed";
  if (chosen > istParts(now).dateISO) return "future";
  if (chosen < backdateFloorISO(now)) return "too old";
  return null;
}

describe("dated entry window", () => {
  const now = new Date("2026-08-14T06:00:00.000Z"); // 11:30 IST, 14 Aug
  const todayISO = istParts(now).dateISO;

  it("accepts today", () => {
    expect(dateIssue(todayISO, now)).toBeNull();
  });

  it("accepts the 1st of the month — the floor itself", () => {
    expect(dateIssue(backdateFloorISO(now), now)).toBeNull();
    expect(backdateFloorISO(now)).toBe("2026-08-01");
  });

  it("refuses tomorrow and the far future", () => {
    expect(dateIssue("2026-08-15", now)).toBe("future");
    expect(dateIssue("2099-12-31", now)).toBe("future");
  });

  it("refuses the last day of the previous month", () => {
    expect(dateIssue("2026-07-31", now)).toBe("too old");
  });

  it("refuses dates from earlier years, including the epoch", () => {
    expect(dateIssue("2020-01-01", now)).toBe("too old");
    expect(dateIssue("1970-01-01", now)).toBe("too old");
  });

  it("refuses anything that isn't an ISO date", () => {
    for (const bad of ["13/04/2026", "not-a-date", "2026-8-1", "", "2026-08-14T00:00:00Z"]) {
      expect(dateIssue(bad, now)).toBe("malformed");
    }
  });

  it("the floor tracks the month, so on the 1st it is today", () => {
    const firstOfMonth = new Date("2026-09-01T06:00:00.000Z");
    expect(backdateFloorISO(firstOfMonth)).toBe(istParts(firstOfMonth).dateISO);
    expect(dateIssue("2026-08-31", firstOfMonth)).toBe("too old");
  });
});
