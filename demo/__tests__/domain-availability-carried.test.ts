import { describe, it, expect } from "vitest";
import {
  buildSegments,
  dayNumber,
  freeWorkingDays,
  impliedBookings,
  isoFromDay,
  projectsOnBar,
  undatedCarriedWork,
  type CarriedWork,
} from "@/lib/domain-availability-bar";

/**
 * Work carried without a booking.
 *
 * Assigning tags is what makes somebody busy in practice — `status` has
 * always counted it — but the bar drew only formal allocations. So a person
 * on two projects with one of them unbooked was drawn half free, and the
 * free-days figure beside them said so in numbers. These are the rules that
 * put that work on the bar.
 */

const TODAY = dayNumber("2026-09-01"); // a Tuesday

function carried(over: Partial<CarriedWork> = {}): CarriedWork {
  return {
    projectId: 2,
    projectName: "Beta",
    openTags: 12,
    startDate: "2026-08-01",
    handoverDate: "2026-09-30",
    workingDaysPerWeek: 5,
    ...over,
  };
}

describe("impliedBookings", () => {
  it("spans the project's own window, clipped to today", () => {
    const [b] = impliedBookings([carried()], TODAY);
    // Started in August, but the bar looks forward — so it begins today.
    expect(b.startDate).toBe("2026-09-01");
    expect(b.endDate).toBe("2026-09-30");
    expect(b.implied).toBe(true);
    expect(b.projectId).toBe(2);
  });

  it("keeps a start date that is still ahead of us", () => {
    const [b] = impliedBookings(
      [carried({ startDate: "2026-09-10" })],
      TODAY,
    );
    expect(b.startDate).toBe("2026-09-10");
  });

  it("carries the project's working week, so Saturdays are right", () => {
    const [b] = impliedBookings([carried({ workingDaysPerWeek: 6 })], TODAY);
    expect(b.workingDaysPerWeek).toBe(6);
  });

  it("drops work with no handover date rather than inventing one", () => {
    expect(impliedBookings([carried({ handoverDate: null })], TODAY)).toEqual([]);
  });

  it("drops work whose handover has already passed", () => {
    expect(
      impliedBookings([carried({ handoverDate: "2026-08-20" })], TODAY),
    ).toEqual([]);
  });

  it("never produces a span that ends before it starts", () => {
    const [b] = impliedBookings(
      [carried({ startDate: "2026-12-01", handoverDate: "2026-09-30" })],
      TODAY,
    );
    expect(dayNumber(b.startDate)).toBeLessThanOrEqual(dayNumber(b.endDate));
  });
});

describe("undatedCarriedWork", () => {
  it("names what cannot be placed, so it isn't silently dropped", () => {
    const rows = undatedCarriedWork(
      [
        carried({ projectId: 3, handoverDate: null }),
        carried({ projectId: 4, handoverDate: "2026-08-01" }),
        carried({ projectId: 5, handoverDate: "2026-10-01" }),
      ],
      TODAY,
    );
    expect(rows.map((r) => r.projectId)).toEqual([3, 4]);
  });

  it("every carried project is either drawn or reported — never neither", () => {
    const all = [
      carried({ projectId: 3, handoverDate: null }),
      carried({ projectId: 4, handoverDate: "2026-08-01" }),
      carried({ projectId: 5, handoverDate: "2026-10-01" }),
    ];
    const drawn = impliedBookings(all, TODAY).map((b) => b.projectId);
    const reported = undatedCarriedWork(all, TODAY).map((c) => c.projectId);
    expect([...drawn, ...reported].sort()).toEqual([3, 4, 5]);
    // and never both
    expect(drawn.filter((id) => reported.includes(id))).toEqual([]);
  });
});

describe("the bug: a second project with no booking behind it", () => {
  const booked = {
    projectId: 1,
    projectName: "Alpha",
    startDate: "2026-09-01",
    endDate: "2026-09-11",
    workingDaysPerWeek: 5,
  };
  const to = dayNumber("2026-09-30");

  it("used to read as free after the booking ended", () => {
    // The old behaviour: allocations only.
    const before = buildSegments(TODAY, to, [booked]);
    expect(freeWorkingDays(before)).toBeGreaterThan(0);
  });

  it("now shows the carried work instead of a gap", () => {
    const after = buildSegments(TODAY, to, [
      booked,
      ...impliedBookings([carried()], TODAY),
    ]);
    // Beta runs to the 30th, so nothing in this window is free any more.
    expect(freeWorkingDays(after)).toBe(0);
  });

  it("marks the overlap as two projects at once", () => {
    const segs = buildSegments(TODAY, to, [
      booked,
      ...impliedBookings([carried()], TODAY),
    ]);
    const overlap = segs.filter((s) => s.projects.length > 1);
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap[0].projects.map((p) => p.projectName).sort()).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("keeps booked and carried distinguishable on the same bar", () => {
    const segs = buildSegments(TODAY, to, [
      booked,
      ...impliedBookings([carried()], TODAY),
    ]);
    const overlap = segs.find((s) => s.projects.length > 1)!;
    const alpha = overlap.projects.find((p) => p.projectName === "Alpha")!;
    const beta = overlap.projects.find((p) => p.projectName === "Beta")!;
    expect(alpha.implied).toBe(false);
    expect(beta.implied).toBe(true);
  });

  it("splits the stretch where the booking ends and only carried work remains", () => {
    const segs = buildSegments(TODAY, to, [
      booked,
      ...impliedBookings([carried()], TODAY),
    ]);
    // The handover from "booked + carried" to "carried alone" is a change
    // of state and must not be merged away.
    const kinds = segs.map((s) =>
      s.projects
        .map((p) => `${p.projectName}${p.implied ? "~" : ""}`)
        .sort()
        .join("+"),
    );
    expect(kinds).toContain("Alpha+Beta~");
    expect(kinds).toContain("Beta~");
  });

  it("a person with only carried work is not drawn as free", () => {
    const segs = buildSegments(TODAY, to, impliedBookings([carried()], TODAY));
    expect(freeWorkingDays(segs)).toBe(0);
    expect(segs.every((s) => s.kind === "busy")).toBe(true);
  });
});

describe("projectsOnBar", () => {
  it("lists every project drawn, booked or carried, once each", () => {
    const segs = buildSegments(TODAY, dayNumber("2026-09-30"), [
      {
        projectId: 1,
        projectName: "Alpha",
        startDate: "2026-09-01",
        endDate: "2026-09-11",
      },
      ...impliedBookings([carried()], TODAY),
    ]);
    const names = projectsOnBar(segs)
      .map((p) => p.projectName)
      .sort();
    expect(names).toEqual(["Alpha", "Beta"]);
  });
});

describe("a booking and carried work on the SAME project", () => {
  it("does not merge into one stretch — the handover is visible", () => {
    const segs = buildSegments(TODAY, dayNumber("2026-09-30"), [
      {
        projectId: 7,
        projectName: "Gamma",
        startDate: "2026-09-01",
        endDate: "2026-09-11",
      },
      {
        projectId: 7,
        projectName: "Gamma",
        startDate: "2026-09-14",
        endDate: "2026-09-30",
        implied: true,
      },
    ]);
    const booked = segs.filter((s) => s.projects.some((p) => !p.implied));
    const carriedSegs = segs.filter((s) => s.projects.some((p) => p.implied));
    expect(booked.length).toBeGreaterThan(0);
    expect(carriedSegs.length).toBeGreaterThan(0);
    expect(booked[0].from).not.toBe(carriedSegs[0].from);
  });
});

describe("segment dates stay readable", () => {
  it("reports real calendar edges for a carried stretch", () => {
    const segs = buildSegments(
      TODAY,
      dayNumber("2026-09-30"),
      impliedBookings([carried()], TODAY),
    );
    expect(isoFromDay(segs[0].from)).toBe("2026-09-01");
    expect(isoFromDay(segs[segs.length - 1].to)).toBe("2026-09-30");
  });
});
