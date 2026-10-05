import { describe, it, expect } from "vitest";
import {
  buildEngagementBlocks,
  countWorkingDays,
  forecastFinish,
  freeFrom,
  hiresNeeded,
  nextWorkingDay,
  periodsFor,
  shiftAnchor,
  summariseForecast,
  workingDaySet,
  type OpenTaskRow,
} from "@/lib/engagement";

const WD = workingDaySet(["Mon", "Tue", "Wed", "Thu", "Fri"]);
// 2026-10-05 is a Monday.
const MON = "2026-10-05";

function task(p: Partial<OpenTaskRow>): OpenTaskRow {
  return {
    projectId: 1,
    projectName: "Alpha",
    startDate: null,
    targetDate: null,
    createdAt: "2026-09-01",
    estimatedHours: null,
    assigneeIds: ["u1"],
    ...p,
  };
}

describe("working days", () => {
  it("falls back to Mon–Fri when the setting is empty", () => {
    expect([...workingDaySet([])].sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("skips the weekend", () => {
    expect(nextWorkingDay("2026-10-10", WD)).toBe("2026-10-12"); // Sat → Mon
    expect(countWorkingDays(MON, "2026-10-11", WD)).toBe(5);
  });
});

describe("buildEngagementBlocks", () => {
  it("merges a person's tasks on one project into a single span", () => {
    const blocks = buildEngagementBlocks(
      [
        task({ startDate: "2026-10-01", targetDate: "2026-10-09", estimatedHours: 10 }),
        task({ startDate: "2026-10-06", targetDate: "2026-10-20", estimatedHours: 6 }),
      ],
      MON,
    );
    expect(blocks).toEqual([
      expect.objectContaining({
        userId: "u1",
        start: "2026-10-01",
        end: "2026-10-20",
        openTasks: 2,
        overdueTasks: 0,
        remainingHours: 16,
      }),
    ]);
  });

  it("keeps overdue and undated tasks running through today", () => {
    const [overdue] = buildEngagementBlocks(
      [task({ startDate: "2026-09-01", targetDate: "2026-09-20" })],
      MON,
    );
    expect(overdue.end).toBe(MON);
    expect(overdue.overdueTasks).toBe(1);

    const [undated] = buildEngagementBlocks([task({ createdAt: "2026-09-28" })], MON);
    expect(undated).toMatchObject({ start: "2026-09-28", end: MON });
  });

  it("splits a shared task's estimate across its assignees", () => {
    const blocks = buildEngagementBlocks(
      [task({ targetDate: "2026-10-30", estimatedHours: 9, assigneeIds: ["a", "b", "c"] })],
      MON,
    );
    expect(blocks.map((b) => b.remainingHours)).toEqual([3, 3, 3]);
  });

  it("ignores unassigned tasks", () => {
    expect(buildEngagementBlocks([task({ assigneeIds: [] })], MON)).toEqual([]);
  });
});

describe("freeFrom", () => {
  it("is today (or the next working day) with nothing open", () => {
    expect(freeFrom([], MON, WD)).toBe(MON);
    expect(freeFrom([], "2026-10-10", WD)).toBe("2026-10-12");
  });
  it("is the working day after the last engagement ends", () => {
    // Last block ends Fri 9 Oct → free Mon 12 Oct.
    expect(freeFrom([{ end: "2026-10-07" }, { end: "2026-10-09" }], MON, WD)).toBe("2026-10-12");
  });
});

describe("forecastFinish", () => {
  it("burns one person's daily hours over working days only", () => {
    // 40h at 8h/day from Monday = Friday, 5 working days.
    expect(forecastFinish(40, [{ id: "a", from: MON, hoursPerDay: 8 }], MON, WD)).toEqual({
      endDate: "2026-10-09",
      days: 5,
    });
    // 48h spills over the weekend to Monday.
    expect(forecastFinish(48, [{ id: "a", from: MON, hoursPerDay: 8 }], MON, WD).endDate).toBe(
      "2026-10-12",
    );
  });

  it("adds people from the day they join", () => {
    // a alone Mon–Tue (16h), then a+b from Wed (16h/day): 40h done Thu.
    const r = forecastFinish(
      40,
      [
        { id: "a", from: MON, hoursPerDay: 8 },
        { id: "b", from: "2026-10-07", hoursPerDay: 8 },
      ],
      MON,
      WD,
    );
    expect(r.endDate).toBe("2026-10-08");
  });

  it("gives no capacity on leave days", () => {
    const r = forecastFinish(
      16,
      [{ id: "a", from: MON, hoursPerDay: 8, leaves: [{ start: MON, end: "2026-10-06" }] }],
      MON,
      WD,
    );
    expect(r.endDate).toBe("2026-10-08");
  });

  it("finishes immediately with no effort, and never with no people", () => {
    expect(forecastFinish(0, [], MON, WD)).toEqual({ endDate: MON, days: 0 });
    expect(forecastFinish(10, [], MON, WD)).toEqual({ endDate: null, days: null });
  });
});

describe("hiresNeeded / summariseForecast", () => {
  const one = [{ id: "a", from: MON, hoursPerDay: 8 }];

  it("needs nobody when the team already makes the target", () => {
    expect(hiresNeeded(40, one, MON, "2026-10-09", WD, 8)).toBe(0);
  });

  it("counts the extra people needed to pull the finish in", () => {
    // 80h by Friday = 16h/day → one more at 8h/day.
    expect(hiresNeeded(80, one, MON, "2026-10-09", WD, 8)).toBe(1);
    // 200h by Friday = 40h/day → four more.
    expect(hiresNeeded(200, one, MON, "2026-10-09", WD, 8)).toBe(4);
  });

  it("summarises free-now vs joining-later and lateness", () => {
    const s = summariseForecast(
      80,
      [
        { id: "a", from: MON, hoursPerDay: 8 },
        { id: "b", from: "2026-10-07", hoursPerDay: 8 },
      ],
      MON,
      "2026-10-09",
      WD,
      8,
    );
    expect(s.freeNow).toBe(1);
    expect(s.joiningLater).toBe(1);
    expect(s.late).toBe(true);
    expect(s.hires).toBe(1);
  });

  it("drops people who'd only join after the work is done", () => {
    const s = summariseForecast(
      8,
      [
        { id: "a", from: MON, hoursPerDay: 8 },
        { id: "late", from: "2026-11-02", hoursPerDay: 8 },
      ],
      MON,
      null,
      WD,
      8,
    );
    expect(s.endDate).toBe(MON);
    expect(s.contributing).toEqual(["a"]);
    expect(s.late).toBe(false);
    expect(s.hires).toBe(0);
  });
});

describe("grid periods", () => {
  it("weekly is Mon–Sun with the weekend marked off", () => {
    const p = periodsFor("weekly", "2026-10-07", WD);
    expect(p.map((x) => x.start)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(p.map((x) => x.offDay)).toEqual([false, false, false, false, false, true, true]);
    expect(p[0].label).toBe("Mon 5");
  });

  it("monthly has one column per day; yearly has 52 week columns", () => {
    expect(periodsFor("monthly", "2026-02-10", WD)).toHaveLength(28);
    const y = periodsFor("yearly", "2026-06-01", WD);
    expect(y).toHaveLength(52);
    expect(y[0]).toMatchObject({ start: "2026-01-01", end: "2026-01-07" });
  });

  it("shifts the anchor by a page", () => {
    expect(shiftAnchor("weekly", MON, 1)).toBe("2026-10-12");
    expect(shiftAnchor("monthly", "2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftAnchor("yearly", MON, -1)).toBe("2025-01-01");
  });
});
