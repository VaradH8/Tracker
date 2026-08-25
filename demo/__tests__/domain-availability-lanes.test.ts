import { describe, it, expect } from "vitest";
import {
  buildSegments,
  dayNumber,
  impliedBookings,
  isoFromDay,
  projectLanes,
  totalWorkingDays,
  workingDayList,
  type Booking,
} from "@/lib/domain-availability-bar";

/**
 * One lane per project, stacked above the merged bar.
 *
 * The merged bar answers "how much of this person is spoken for". It could
 * not answer "what are they on" — two projects became two bands inside a
 * 16px bar, unreadable down a list of thirty people. Lanes answer the
 * second question without giving up the first.
 *
 * The invariant that makes them readable: every lane divides the SAME total
 * as the bar below it. Lanes computed independently would each get their own
 * denominator — a six-day project counts its Saturdays, a five-day one does
 * not — and bars meant to be compared by eye would not line up.
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

describe("lanes line up with the bar", () => {
  it("every lane spans the same total as the merged bar", () => {
    const bookings = [alpha, beta];
    const barTotal = totalWorkingDays(buildSegments(FROM, TO, bookings));
    for (const lane of projectLanes(FROM, TO, bookings)) {
      const laneTotal = lane.segments.reduce((n, s) => n + s.workingDays, 0);
      expect(laneTotal).toBe(barTotal);
    }
  });

  it("holds even when the projects disagree about Saturdays", () => {
    // A six-day project pulls Saturdays into the shared timeline. The
    // five-day lane must still divide that same total, or the two rows
    // drift apart on screen.
    const sixDay: Booking = { ...beta, workingDaysPerWeek: 6 };
    const bookings = [alpha, sixDay];
    const barTotal = totalWorkingDays(buildSegments(FROM, TO, bookings));
    const lanes = projectLanes(FROM, TO, bookings);
    expect(lanes).toHaveLength(2);
    for (const lane of lanes) {
      const laneTotal = lane.segments.reduce((n, s) => n + s.workingDays, 0);
      expect(laneTotal).toBe(barTotal);
    }
  });

  it("uses the same working days the bar does", () => {
    const bookings = [alpha, beta];
    const days = workingDayList(FROM, TO, bookings);
    const barTotal = totalWorkingDays(buildSegments(FROM, TO, bookings));
    expect(days.length).toBe(barTotal);
    // Sunday is never in there.
    for (const d of days) expect(new Date(d * 86400000).getUTCDay()).not.toBe(0);
  });
});

describe("what each lane says", () => {
  it("one lane per project, earliest start first", () => {
    const lanes = projectLanes(FROM, TO, [beta, alpha]);
    expect(lanes.map((l) => l.projectName)).toEqual(["Alpha", "Beta"]);
  });

  it("covers only that project's own days", () => {
    const [alphaLane] = projectLanes(FROM, TO, [alpha, beta]);
    const covered = alphaLane.segments.filter((s) => s.covered);
    expect(isoFromDay(covered[0].from)).toBe("2026-09-01");
    expect(isoFromDay(covered[covered.length - 1].to)).toBe("2026-09-11");
    // 1–11 Sept, weekends out: 1–4 (4) + 7–11 (5) = 9
    expect(alphaLane.workingDays).toBe(9);
  });

  it("reports where the project starts, for ordering", () => {
    const lanes = projectLanes(FROM, TO, [alpha, beta]);
    expect(isoFromDay(lanes[0].startsOn!)).toBe("2026-09-01");
    expect(isoFromDay(lanes[1].startsOn!)).toBe("2026-09-08");
  });

  it("marks carried work so the lane can be drawn hatched", () => {
    const lanes = projectLanes(FROM, TO, [
      alpha,
      ...impliedBookings(
        [
          {
            projectId: 3,
            projectName: "Gamma",
            openTags: 4,
            startDate: "2026-09-01",
            handoverDate: "2026-09-30",
            workingDaysPerWeek: 5,
          },
        ],
        FROM,
      ),
    ]);
    const gamma = lanes.find((l) => l.projectName === "Gamma")!;
    expect(gamma.implied).toBe(true);
    expect(lanes.find((l) => l.projectName === "Alpha")!.implied).toBe(false);
  });

  it("gives a project booked AND carried a lane each — the handover stays visible", () => {
    const lanes = projectLanes(FROM, TO, [
      { ...alpha, projectId: 7, projectName: "Delta" },
      {
        projectId: 7,
        projectName: "Delta",
        startDate: "2026-09-14",
        endDate: "2026-09-30",
        implied: true,
      },
    ]);
    expect(lanes).toHaveLength(2);
    expect(lanes.map((l) => l.implied).sort()).toEqual([false, true]);
  });

  it("drops a booking that falls entirely outside the window", () => {
    const lanes = projectLanes(FROM, TO, [
      alpha,
      { ...beta, startDate: "2026-11-01", endDate: "2026-11-20" },
    ]);
    expect(lanes.map((l) => l.projectName)).toEqual(["Alpha"]);
  });

  it("no lanes at all when there is nothing booked", () => {
    expect(projectLanes(FROM, TO, [])).toEqual([]);
  });

  it("a single project still produces its lane — the caller decides to hide it", () => {
    expect(projectLanes(FROM, TO, [alpha])).toHaveLength(1);
  });
});

describe("overlap is visible across lanes", () => {
  it("both lanes cover the days the two projects share", () => {
    const lanes = projectLanes(FROM, TO, [alpha, beta]);
    const overlapDay = dayNumber("2026-09-10"); // inside both
    for (const lane of lanes) {
      const seg = lane.segments.find(
        (s) => overlapDay >= s.from && overlapDay <= s.to,
      )!;
      expect(seg.covered).toBe(true);
    }
  });

  it("and the merged bar agrees it is two projects at once", () => {
    const segs = buildSegments(FROM, TO, [alpha, beta]);
    expect(segs.some((s) => s.projects.length > 1)).toBe(true);
  });
});
