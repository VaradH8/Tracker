import { describe, it, expect } from "vitest";
import {
  buildColumns,
  buildGrid,
  committedShare,
  dayNumber,
  groupSpans,
  impliedBookings,
  isoFromDay,
  monthColumnsForYear,
  weekColumnsForYear,
  workingDayList,
  yearColumns,
  yearsCovered,
  type Booking,
} from "@/lib/domain-availability-bar";

/**
 * The engagement grid.
 *
 * A continuous bar answers "how loaded is this person" and cannot answer
 * "who is free in week 33" — there is nothing to read down. Columns add the
 * second axis. These are the rules that keep them honest.
 */

const YEAR = 2026;
const JAN1 = dayNumber("2026-01-01");
const DEC31 = dayNumber("2026-12-31");

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

describe("weekColumnsForYear", () => {
  const cols = weekColumnsForYear(YEAR, [alpha, beta]);

  it("covers the whole year with no gap and no overlap", () => {
    expect(cols[0].from).toBe(JAN1);
    expect(cols[cols.length - 1].to).toBe(DEC31);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i].from).toBe(cols[i - 1].to + 1);
    }
  });

  it("is about a year of weeks", () => {
    expect(cols.length).toBeGreaterThanOrEqual(52);
    expect(cols.length).toBeLessThanOrEqual(54);
  });

  it("numbers them from one", () => {
    expect(cols[0].label).toBe("1");
    expect(cols[4].label).toBe("5");
  });

  it("groups each column under its month", () => {
    expect(cols[0].group).toBe("Jan");
    expect(cols[cols.length - 1].group).toBe("Dec");
  });

  it("the columns divide exactly the year's working days", () => {
    const total = cols.reduce((n, c) => n + c.workingDays, 0);
    expect(total).toBe(workingDayList(JAN1, DEC31, [alpha, beta]).length);
  });

  it("clips the opening stub rather than reaching before the year", () => {
    // 1 Jan 2026 is a Thursday, so week one is Thu–Sun: two working days.
    expect(isoFromDay(cols[0].from)).toBe("2026-01-01");
    expect(isoFromDay(cols[0].to)).toBe("2026-01-04");
    expect(cols[0].workingDays).toBe(2);
  });

  it("counts a six-day project's Saturdays", () => {
    const six: Booking = { ...alpha, workingDaysPerWeek: 6 };
    const five = weekColumnsForYear(YEAR, [alpha]);
    const sixCols = weekColumnsForYear(YEAR, [six]);
    const sum = (cs: typeof five) => cs.reduce((n, c) => n + c.workingDays, 0);
    expect(sum(sixCols)).toBeGreaterThan(sum(five));
  });
});

describe("monthColumnsForYear", () => {
  const cols = monthColumnsForYear(YEAR, []);

  it("is twelve columns, Jan to Dec", () => {
    expect(cols).toHaveLength(12);
    expect(cols.map((c) => c.label)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
  });

  it("each column is exactly its month", () => {
    expect(isoFromDay(cols[1].from)).toBe("2026-02-01");
    expect(isoFromDay(cols[1].to)).toBe("2026-02-28");
    expect(isoFromDay(cols[11].to)).toBe("2026-12-31");
  });

  it("groups under the year", () => {
    expect(new Set(cols.map((c) => c.group))).toEqual(new Set(["2026"]));
  });
});

describe("yearColumns", () => {
  it("one column per year, each a whole year", () => {
    const cols = yearColumns([2026, 2027], []);
    expect(cols.map((c) => c.label)).toEqual(["2026", "2027"]);
    expect(isoFromDay(cols[0].from)).toBe("2026-01-01");
    expect(isoFromDay(cols[1].to)).toBe("2027-12-31");
  });

  it("no years, no columns", () => {
    expect(yearColumns([], [])).toEqual([]);
  });
});

describe("buildColumns dispatches on the view", () => {
  it("weekly by default", () => {
    expect(buildColumns("week", YEAR, []).length).toBeGreaterThan(50);
  });
  it("monthly is twelve", () => {
    expect(buildColumns("month", YEAR, [])).toHaveLength(12);
  });
  it("yearly follows the years given", () => {
    expect(buildColumns("year", YEAR, [], [2025, 2026])).toHaveLength(2);
  });
});

describe("groupSpans", () => {
  it("draws each month once across its weeks", () => {
    const spans = groupSpans(weekColumnsForYear(YEAR, []));
    expect(spans.map((s) => s.group).slice(0, 3)).toEqual(["Jan", "Feb", "Mar"]);
    expect(spans).toHaveLength(12);
    // The spans account for every column, none counted twice.
    const total = spans.reduce((n, s) => n + s.span, 0);
    expect(total).toBe(weekColumnsForYear(YEAR, []).length);
  });

  it("nothing in, nothing out", () => {
    expect(groupSpans([])).toEqual([]);
  });
});

describe("buildGrid", () => {
  const cols = weekColumnsForYear(YEAR, [alpha, beta]);

  it("gives every column its own segments, summing to that column", () => {
    for (const cell of buildGrid(cols, [alpha, beta])) {
      const inCell = cell.segments.reduce((n, s) => n + s.workingDays, 0);
      expect(inCell).toBe(cell.column.workingDays);
    }
  });

  it("work never bleeds into a neighbouring column", () => {
    for (const cell of buildGrid(cols, [alpha])) {
      for (const seg of cell.segments) {
        expect(seg.from).toBeGreaterThanOrEqual(cell.column.from);
        expect(seg.to).toBeLessThanOrEqual(cell.column.to);
      }
    }
  });

  it("two projects in one column read as two projects", () => {
    const overlap = buildGrid(cols, [alpha, beta])
      .flatMap((g) => g.segments)
      .filter((s) => s.projects.length > 1);
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
      dayNumber("2026-09-01"),
    );
    const marks = buildGrid(weekColumnsForYear(YEAR, carried), carried)
      .flatMap((g) => g.segments)
      .flatMap((s) => s.projects)
      .filter((p) => p.projectName === "Gamma");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((p) => p.implied)).toBe(true);
  });

  it("nobody booked means every column is free", () => {
    for (const cell of buildGrid(weekColumnsForYear(YEAR, []), [])) {
      expect(cell.segments.every((s) => s.kind === "free")).toBe(true);
    }
  });
});

describe("committedShare — a part-booked week is not a full one", () => {
  const cols = weekColumnsForYear(YEAR, [alpha]);
  const grid = buildGrid(cols, [alpha]);

  it("a fully booked column is 1", () => {
    const full = grid.find(
      (g) =>
        g.column.workingDays > 0 &&
        g.segments.every((s) => s.kind === "busy"),
    )!;
    expect(committedShare(full.segments, full.column)).toBe(1);
  });

  it("an untouched column is 0", () => {
    const empty = grid.find((g) =>
      g.segments.every((s) => s.kind === "free"),
    )!;
    expect(committedShare(empty.segments, empty.column)).toBe(0);
  });

  it("a week booked Monday to Wednesday is three fifths", () => {
    const midweek: Booking = {
      projectId: 9,
      projectName: "Short",
      startDate: "2026-09-07", // Monday
      endDate: "2026-09-09", // Wednesday
      workingDaysPerWeek: 5,
    };
    const cs = weekColumnsForYear(YEAR, [midweek]);
    const cell = buildGrid(cs, [midweek]).find((g) =>
      g.segments.some((s) => s.kind === "busy"),
    )!;
    expect(committedShare(cell.segments, cell.column)).toBeCloseTo(0.6, 5);
  });

  it("never exceeds 1, however many projects overlap", () => {
    for (const cell of buildGrid(cols, [alpha, beta, { ...alpha, projectId: 7 }])) {
      expect(committedShare(cell.segments, cell.column)).toBeLessThanOrEqual(1);
    }
  });
});

describe("yearsCovered", () => {
  const today = dayNumber("2026-05-01");

  it("always offers the current year", () => {
    expect(yearsCovered([], today)).toEqual([2026]);
  });

  it("spans a booking that crosses a year end", () => {
    expect(
      yearsCovered(
        [{ ...alpha, startDate: "2026-12-01", endDate: "2027-02-01" }],
        today,
      ),
    ).toEqual([2026, 2027]);
  });

  it("stops at an early release rather than the original end", () => {
    expect(
      yearsCovered(
        [
          {
            ...alpha,
            startDate: "2026-01-01",
            endDate: "2028-01-01",
            releasedAt: "2026-06-01",
          },
        ],
        today,
      ),
    ).toEqual([2026]);
  });

  it("comes back sorted, with no repeats", () => {
    const ys = yearsCovered(
      [
        { ...alpha, startDate: "2028-01-01", endDate: "2028-02-01" },
        { ...beta, startDate: "2024-01-01", endDate: "2024-02-01" },
      ],
      today,
    );
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(new Set(ys).size).toBe(ys.length);
  });
});
