import { describe, it, expect } from "vitest";
import {
  buildSegments,
  colourIndexes,
  dayNumber,
  freeWorkingDays,
  isWorkingDay,
  isoFromDay,
} from "@/lib/domain-availability-bar";

/**
 * One rectangle per person, filled end to end.
 *
 * Every day in the window is committed, free, or not a working day, and
 * consecutive days in the same state merge into a segment. What this has
 * to get right is the working week: a five-day project and a six-day one
 * do not share their Saturdays, and a bar that ignores that overstates how
 * much of somebody's month is spoken for.
 */

const d = dayNumber;
// 2026-08-24 is a Monday. Every date here is anchored to that so the
// weekday arithmetic is checkable by eye.
const MON = d("2026-08-24");
const SAT = d("2026-08-29");
const SUN = d("2026-08-30");

describe("which days are working days", () => {
  it("is Monday to Friday on a five-day week", () => {
    for (let i = 0; i < 5; i++) expect(isWorkingDay(MON + i, 5)).toBe(true);
    expect(isWorkingDay(SAT, 5)).toBe(false);
    expect(isWorkingDay(SUN, 5)).toBe(false);
  });

  it("adds Saturday on a six-day week", () => {
    expect(isWorkingDay(SAT, 6)).toBe(true);
    // Sunday never is: the field only accepts 5 or 6.
    expect(isWorkingDay(SUN, 6)).toBe(false);
  });

  it("round-trips a day back to its date", () => {
    expect(isoFromDay(MON)).toBe("2026-08-24");
  });
});

describe("building the bar", () => {
  const booking = (over = {}) => ({
    projectId: 1,
    projectName: "Metro",
    startDate: "2026-08-24",
    endDate: "2026-09-04",
    ...over,
  });

  it("covers every day in the window exactly once", () => {
    // The bar is one rectangle, so the segments have to tile it — a gap
    // would render as a hole and an overlap as a bar wider than its row.
    const segs = buildSegments(MON, MON + 20, [booking()]);
    expect(segs[0].from).toBe(MON);
    expect(segs[segs.length - 1].to).toBe(MON + 20);
    expect(segs.reduce((n, s) => n + s.days, 0)).toBe(21);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].from).toBe(segs[i - 1].to + 1);
    }
  });

  it("breaks a booking at the weekend it runs across", () => {
    const segs = buildSegments(MON, SUN, [booking()]);
    expect(segs.map((s) => s.kind)).toEqual(["busy", "off"]);
    expect(segs[0].days).toBe(5); // Mon–Fri
    expect(segs[1].days).toBe(2); // Sat–Sun
  });

  it("keeps Saturday busy when the project works six days", () => {
    const segs = buildSegments(MON, SUN, [
      booking({ workingDaysPerWeek: 6 }),
    ]);
    expect(segs.map((s) => s.kind)).toEqual(["busy", "off"]);
    expect(segs[0].days).toBe(6); // Mon–Sat
    expect(segs[1].days).toBe(1); // Sunday only
  });

  it("marks the gap between two bookings as free", () => {
    const segs = buildSegments(MON, MON + 13, [
      booking({ endDate: "2026-08-25" }),
      booking({ projectId: 2, projectName: "BPCL", startDate: "2026-09-02", endDate: "2026-09-06" }),
    ]);
    const kinds = segs.map((s) => s.kind);
    expect(kinds).toContain("free");
    expect(kinds).toContain("busy");
  });

  it("names every project covering a doubled-up stretch", () => {
    // One rectangle still has to admit somebody is on two things at once.
    const segs = buildSegments(MON, MON + 4, [
      booking(),
      booking({ projectId: 2, projectName: "BPCL" }),
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].projects.map((p) => p.projectName).sort()).toEqual([
      "BPCL",
      "Metro",
    ]);
  });

  it("splits where the second booking starts, not before", () => {
    const segs = buildSegments(MON, MON + 4, [
      booking(),
      booking({ projectId: 2, projectName: "BPCL", startDate: "2026-08-26" }),
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0].projects).toHaveLength(1);
    expect(segs[1].projects).toHaveLength(2);
    expect(isoFromDay(segs[1].from)).toBe("2026-08-26");
  });

  it("ends a released booking on the day it was released", () => {
    const segs = buildSegments(MON, MON + 4, [
      booking({ releasedAt: "2026-08-25" }),
    ]);
    expect(segs[0].kind).toBe("busy");
    expect(segs[0].days).toBe(2); // Mon and Tue
    expect(segs[1].kind).toBe("free");
  });

  it("is entirely free for somebody with nothing booked", () => {
    const segs = buildSegments(MON, MON + 4, []);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe("free");
  });

  it("returns nothing for a backwards window", () => {
    expect(buildSegments(MON + 5, MON, [])).toEqual([]);
  });
});

describe("counting free time", () => {
  it("counts working days only, never the weekend", () => {
    // "3 days free" has to mean three days somebody could work, or the
    // number is worse than not showing one.
    const segs = buildSegments(MON, SUN, []);
    expect(freeWorkingDays(segs)).toBe(5);
  });

  it("is zero when every working day is booked", () => {
    const segs = buildSegments(MON, MON + 4, [
      {
        projectId: 1,
        projectName: "Metro",
        startDate: "2026-08-24",
        endDate: "2026-08-28",
      },
    ]);
    expect(freeWorkingDays(segs)).toBe(0);
  });
});

describe("project colours", () => {
  it("gives the same project the same slot on every row", () => {
    const a = colourIndexes([
      { projectId: 7, projectName: "Metro" },
      { projectId: 3, projectName: "Aquatech" },
    ]);
    const b = colourIndexes([
      { projectId: 3, projectName: "Aquatech" },
      { projectId: 7, projectName: "Metro" },
    ]);
    expect(a.get(7)).toBe(b.get(7));
    expect(a.get(3)).toBe(b.get(3));
  });

  it("orders by name, so adding a project does not reshuffle the rest", () => {
    const before = colourIndexes([
      { projectId: 3, projectName: "Aquatech" },
      { projectId: 7, projectName: "Metro" },
    ]);
    const after = colourIndexes([
      { projectId: 3, projectName: "Aquatech" },
      { projectId: 9, projectName: "Zenith" },
      { projectId: 7, projectName: "Metro" },
    ]);
    expect(after.get(3)).toBe(before.get(3));
    expect(after.get(7)).toBe(before.get(7));
  });
});
