import { describe, it, expect } from "vitest";
import {
  buildColumns,
  buildGrid,
  dayNumber,
  impliedBookings,
  isoFromDay,
  pickGranularity,
  workingDayList,
  type Booking,
} from "@/lib/domain-availability-bar";

/**
 * The engagement grid.
 *
 * A continuous bar answers "how loaded is this person" and cannot answer
 * "who is free the week after next" — there is nothing to read down. Columns
 * add the second axis. These are the rules that keep them honest.
 */

const FROM = dayNumber("2026-09-01"); // Tuesday
const TO = dayNumber("2026-09-30");

const alpha: Booking = {
  projectId: 1,
  projectName: "Alpha",
  startDate: "2026-09-01",
  endDate: "2026-09-11",
  workingDaysPerWeek: 5,
};
const beta: Booking = {
  projectId: 2,
  projectName: "Beta",
  startDate: "2026-09-08",
  endDate: "2026-09-25",
  workingDaysPerWeek: 5,
};

describe("pickGranularity", () => {
  it("weeks while the window is short enough to read", () => {
    expect(pickGranularity(FROM, TO)).toBe("week");
  });

  it("months once weekly columns would be unreadable", () => {
    expect(pickGranularity(FROM, dayNumber("2027-06-30"))).toBe("month");
  });

  it("switches at fourteen weeks, not before", () => {
    expect(pickGranularity(FROM, FROM + 14 * 7 - 1)).toBe("week");
    expect(pickGranularity(FROM, FROM + 15 * 7)).toBe("month");
  });
});

describe("buildColumns", () => {
  it("covers the window with no gap and no overlap", () => {
    const cols = buildColumns(FROM, TO, [alpha, beta], "week");
    expect(cols.length).toBeGreaterThan(1);
    expect(cols[0].from).toBe(FROM);
    expect(cols[cols.length - 1].to).toBe(TO);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i].from).toBe(cols[i - 1].to + 1);
    }
  });

  it("the columns divide exactly the window's working days", () => {
    const cols = buildColumns(FROM, TO, [alpha, beta], "week");
    const total = cols.reduce((n, c) => n + c.workingDays, 0);
    expect(total).toBe(workingDayList(FROM, TO, [alpha, beta]).length);
  });

  it("clips the first column instead of pretending the week began earlier", () => {
    // 1 Sep 2026 is a Tuesday, so the opening column is Tue–Fri: 4 days.
    const [first] = buildColumns(FROM, TO, [alpha, beta], "week");
    expect(isoFromDay(first.from)).toBe("2026-09-01");
    expect(isoFromDay(first.to)).toBe("2026-09-06");
    expect(first.workingDays).toBe(4);
  });

  it("drops a column with no working days in it at all", () => {
    // A window that is a single Sunday.
    const sunday = dayNumber("2026-09-06");
    expect(buildColumns(sunday, sunday, [], "week")).toEqual([]);
  });

  it("counts a six-day project's Saturdays", () => {
    const six: Booking = { ...alpha, workingDaysPerWeek: 6, endDate: "2026-09-30" };
    const five = buildColumns(FROM, TO, [alpha], "week");
    const sixCols = buildColumns(FROM, TO, [six], "week");
    const fiveTotal = five.reduce((n, c) => n + c.workingDays, 0);
    const sixTotal = sixCols.reduce((n, c) => n + c.workingDays, 0);
    expect(sixTotal).toBeGreaterThan(fiveTotal);
  });

  it("months are whole months, clipped at the ends", () => {
    const cols = buildColumns(FROM, dayNumber("2026-11-15"), [], "month");
    expect(cols.map((c) => c.label)).toEqual(["Sep 26", "Oct 26", "Nov 26"]);
    expect(isoFromDay(cols[1].from)).toBe("2026-10-01");
    expect(isoFromDay(cols[2].to)).toBe("2026-11-15");
  });

  it("labels weekly columns by their first day", () => {
    const cols = buildColumns(FROM, TO, [], "week");
    expect(cols[0].label).toBe("1 Sep");
    expect(cols[1].label).toBe("7 Sep");
  });

  it("an empty window produces no columns", () => {
    expect(buildColumns(TO, FROM, [])).toEqual([]);
  });
});

describe("buildGrid", () => {
  it("gives every column its own segments", () => {
    const cols = buildColumns(FROM, TO, [alpha, beta], "week");
    const grid = buildGrid(cols, [alpha, beta]);
    expect(grid).toHaveLength(cols.length);
    for (const cell of grid) {
      const inCell = cell.segments.reduce((n, s) => n + s.workingDays, 0);
      expect(inCell).toBe(cell.column.workingDays);
    }
  });

  it("work never bleeds into a neighbouring column", () => {
    const cols = buildColumns(FROM, TO, [alpha], "week");
    const grid = buildGrid(cols, [alpha]);
    for (const cell of grid) {
      for (const seg of cell.segments) {
        expect(seg.from).toBeGreaterThanOrEqual(cell.column.from);
        expect(seg.to).toBeLessThanOrEqual(cell.column.to);
      }
    }
  });

  it("a week split between a project and nothing shows both", () => {
    // Alpha ends Friday 11 Sep; that column runs 7–13 Sep.
    const cols = buildColumns(FROM, TO, [alpha], "week");
    const grid = buildGrid(cols, [alpha]);
    const week = grid.find((g) => isoFromDay(g.column.from) === "2026-09-07")!;
    expect(week.segments.some((s) => s.kind === "busy")).toBe(true);
    // 11 Sep is the Friday, so this column is busy throughout.
    expect(week.column.workingDays).toBe(5);
  });

  it("a fully free column is one free segment", () => {
    const cols = buildColumns(FROM, TO, [alpha], "week");
    const grid = buildGrid(cols, [alpha]);
    const last = grid[grid.length - 1];
    expect(last.segments.every((s) => s.kind === "free")).toBe(true);
  });

  it("two projects in one column read as two projects", () => {
    const cols = buildColumns(FROM, TO, [alpha, beta], "week");
    const grid = buildGrid(cols, [alpha, beta]);
    const overlap = grid.flatMap((g) => g.segments).filter((s) => s.projects.length > 1);
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap[0].projects.map((p) => p.projectName).sort()).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("carried work stays marked inside a cell", () => {
    const carried = impliedBookings(
      [
        {
          projectId: 3,
          projectName: "Gamma",
          openTags: 5,
          startDate: "2026-09-01",
          handoverDate: "2026-09-30",
          workingDaysPerWeek: 5,
        },
      ],
      FROM,
    );
    const cols = buildColumns(FROM, TO, carried, "week");
    const grid = buildGrid(cols, carried);
    const gamma = grid
      .flatMap((g) => g.segments)
      .flatMap((s) => s.projects)
      .filter((p) => p.projectName === "Gamma");
    expect(gamma.length).toBeGreaterThan(0);
    expect(gamma.every((p) => p.implied)).toBe(true);
  });

  it("nobody booked means every column is free", () => {
    const cols = buildColumns(FROM, TO, [], "week");
    const grid = buildGrid(cols, []);
    expect(grid.length).toBeGreaterThan(0);
    for (const cell of grid) {
      expect(cell.segments.every((s) => s.kind === "free")).toBe(true);
    }
  });
});
