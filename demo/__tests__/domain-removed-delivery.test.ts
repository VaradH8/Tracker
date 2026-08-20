import { describe, it, expect } from "vitest";
import { assignmentContribution, totalTagPosition } from "@/lib/domain";

/**
 * Removing somebody does not un-deliver their work.
 *
 * The first version of Remove filtered removed batches out of the project
 * totals entirely, so taking a Lead off a project silently wiped ten
 * delivered tags off it. That is wrong: a Lead approved those tags, they
 * went to the client, and the project is that much further along whoever
 * carries the rest.
 *
 * The undelivered remainder is the opposite case — nobody holds it any
 * more, so it returns to the pool and shows up again as "not yet assigned
 * to anyone".
 *
 * Deleting a resource is the operation that does take the delivered figure
 * with it, which is why it is Admin-only and asks twice.
 */

const live = (assigned: number, delivered: number) => ({
  assignedCount: assigned,
  deliveredCount: delivered,
  removedAt: null,
});
const removed = (assigned: number, delivered: number) => ({
  assignedCount: assigned,
  deliveredCount: delivered,
  removedAt: new Date("2026-08-20"),
});

describe("what one batch contributes", () => {
  it("counts a live batch in full", () => {
    expect(assignmentContribution(live(100, 10))).toEqual({
      assigned: 100,
      delivered: 10,
    });
  });

  it("keeps every delivered tag of a removed batch", () => {
    // The reported bug, in one line.
    expect(assignmentContribution(removed(10, 10)).delivered).toBe(10);
  });

  it("returns a removed batch's undelivered tags to the pool", () => {
    // 300 assigned, 120 done: the 180 nobody is carrying stop counting as
    // assigned, so they reappear as "not yet assigned to anyone".
    expect(assignmentContribution(removed(300, 120))).toEqual({
      assigned: 120,
      delivered: 120,
    });
  });

  it("contributes nothing from a removed batch that delivered nothing", () => {
    expect(assignmentContribution(removed(300, 0))).toEqual({
      assigned: 0,
      delivered: 0,
    });
  });

  it("treats a missing removedAt as live", () => {
    // Rows read through a select that does not ask for the column must
    // not silently count as removed.
    expect(
      assignmentContribution({ assignedCount: 50, deliveredCount: 5 }),
    ).toEqual({ assigned: 50, delivered: 5 });
  });
});

describe("a project's position across live and removed work", () => {
  it("adds the survivors and the departed together", () => {
    const position = totalTagPosition([
      live(220, 40),
      live(120, 0),
      removed(10, 10),
      removed(300, 120),
    ]);
    // delivered: 40 + 0 + 10 + 120
    expect(position.delivered).toBe(170);
    // assigned: 220 + 120 + 10 + 120 — the 290 undelivered tags the two
    // departed were carrying are back in the pool.
    expect(position.assigned).toBe(470);
  });

  it("never reports delivered above assigned", () => {
    // Progress bars and "remaining" both depend on this holding.
    const rows = [live(100, 10), removed(300, 120), removed(50, 0)];
    const position = totalTagPosition(rows);
    expect(position.delivered).toBeLessThanOrEqual(position.assigned);
  });

  it("is zero for a project with nothing on it", () => {
    expect(totalTagPosition([])).toEqual({ assigned: 0, delivered: 0 });
  });

  it("is unchanged by removing a fully delivered batch", () => {
    // Nothing was outstanding, so nothing returns to the pool and the
    // project's figures do not move at all.
    const before = totalTagPosition([live(220, 40), live(10, 10)]);
    const after = totalTagPosition([live(220, 40), removed(10, 10)]);
    expect(after).toEqual(before);
  });
});
