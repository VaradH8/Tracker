import { describe, it, expect } from "vitest";
import { peopleOnProject } from "@/lib/domain-forecast";

/**
 * Regression: a Lead or Team Lead given tags on a project did not appear
 * on it at all.
 *
 * The cause was an either/or — a project used its bookings when it had
 * any, and only fell back to tag holders when it had none. So the first
 * formal booking made every unbooked tag holder disappear: they were
 * missing from the resource list, and their rate was left out of the
 * throughput while their tags still counted in the work remaining. The
 * projected date was pessimistic and the person was invisible.
 */

const sneha = { id: "u1", name: "Sneha" };
const lead = { id: "u2", name: "Lead" };
const tl = { id: "u3", name: "Team Lead" };

describe("peopleOnProject", () => {
  it("includes a tag holder even when somebody else is booked", () => {
    // The exact bug: one booking used to hide every unbooked tag holder.
    const people = peopleOnProject(
      [{ user: sneha }],
      [{ assignee: lead }, { assignee: tl }],
    );
    expect(people.map((p) => p.name).sort()).toEqual(["Lead", "Sneha", "Team Lead"]);
  });

  it("still includes people who are booked but hold no tags", () => {
    const people = peopleOnProject([{ user: sneha }], []);
    expect(people).toEqual([sneha]);
  });

  it("still works with tag holders and no bookings at all", () => {
    const people = peopleOnProject([], [{ assignee: lead }]);
    expect(people).toEqual([lead]);
  });

  it("counts somebody once when they are both booked and holding tags", () => {
    const people = peopleOnProject([{ user: sneha }], [{ assignee: sneha }]);
    expect(people).toHaveLength(1);
  });

  it("does not repeat a person holding several batches", () => {
    const people = peopleOnProject(
      [],
      [{ assignee: lead }, { assignee: lead }, { assignee: tl }],
    );
    expect(people).toHaveLength(2);
  });

  it("is empty for a project nobody is on", () => {
    expect(peopleOnProject([], [])).toEqual([]);
  });
});
