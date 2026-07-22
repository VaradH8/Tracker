import { describe, it, expect } from "vitest";
import { bulkTaskTitles, distributeEvenly } from "@/lib/domain";

/** How many items each assignee ended up with, in the order given. */
function counts(count: number, people: string[]): number[] {
  const spread = distributeEvenly(count, people);
  return people.map((p) => spread.filter((a) => a === p).length);
}

describe("distributeEvenly", () => {
  it("splits 20 supports across a team of 4 evenly — 5 each", () => {
    expect(counts(20, ["a", "b", "c", "d"])).toEqual([5, 5, 5, 5]);
  });

  it("gives the remainder to the earlier names when it doesn't divide", () => {
    expect(counts(22, ["a", "b", "c", "d"])).toEqual([6, 6, 5, 5]);
    expect(counts(7, ["a", "b"])).toEqual([4, 3]);
  });

  it("never leaves a gap of more than one between assignees", () => {
    for (const n of [1, 3, 9, 16, 99, 200]) {
      for (const size of [1, 2, 3, 4, 7]) {
        const c = counts(n, Array.from({ length: size }, (_, i) => `p${i}`));
        expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
        expect(c.reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });

  it("assigns everything to one person when the team is one", () => {
    expect(counts(20, ["a"])).toEqual([20]);
  });

  it("leaves tasks unassigned when nobody is picked", () => {
    expect(distributeEvenly(3, [])).toEqual([null, null, null]);
  });

  it("numbers the batch titles from 1", () => {
    expect(bulkTaskTitles("Cable", 3)).toEqual(["Cable 1", "Cable 2", "Cable 3"]);
  });
});
