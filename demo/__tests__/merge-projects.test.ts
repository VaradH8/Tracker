import { describe, it, expect } from "vitest";
import {
  candidatesFor,
  describePlan,
  normaliseName,
  planMerge,
  type ProjectRow,
} from "@/lib/merge-projects";

/**
 * Project.name has no unique constraint, which is how one project comes to
 * exist twice under different capitalisation. Renaming does not fix it —
 * that leaves two rows with the same name — so the duplicate is emptied of
 * its tasks and deleted. These are the rules for deciding which row lives.
 */

const p = (
  id: number,
  name: string,
  taskCount = 0,
  clientId = 1,
): ProjectRow => ({ id, name, clientId, taskCount });

describe("normaliseName", () => {
  it("ignores case, spacing and punctuation", () => {
    expect(normaliseName("ENIMAX")).toBe(normaliseName("Enimax"));
    expect(normaliseName("P & ID")).toBe(normaliseName("P&ID"));
    expect(normaliseName("  Thermax   ENIMAX ")).toBe("thermax enimax");
  });

  it("survives nothing useful", () => {
    expect(normaliseName("")).toBe("");
    expect(normaliseName("   ")).toBe("");
  });
});

describe("candidatesFor", () => {
  const all = [
    p(1, "Enimax"),
    p(2, "ENIMAX"),
    p(3, "Thermax ENIMAX"),
    p(4, "Thermax P&ID"),
    p(5, "Tracker"),
  ];

  it("finds every project carrying the token, whatever the casing", () => {
    expect(candidatesFor(all, "enimax").map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("leaves unrelated projects alone", () => {
    expect(candidatesFor(all, "enimax").map((x) => x.name)).not.toContain("Tracker");
  });

  it("an empty token matches nothing, rather than everything", () => {
    expect(candidatesFor(all, "")).toEqual([]);
    expect(candidatesFor(all, "   ")).toEqual([]);
  });
});

describe("planMerge", () => {
  const opts = { canonicalName: "Thermax ENIMAX", token: "enimax" };

  it("keeps the row already spelled canonically, whatever its size", () => {
    const plan = planMerge(
      [p(1, "Enimax", 40), p(2, "ENIMAX", 10), p(3, "Thermax ENIMAX", 1)],
      opts,
    );
    expect(plan.keep!.id).toBe(3);
    expect(plan.absorb.map((x) => x.id).sort()).toEqual([1, 2]);
    expect(plan.tasksMoving).toBe(50);
    expect(plan.renameNeeded).toBe(false);
  });

  it("falls back to the busiest row and flags the rename", () => {
    const plan = planMerge([p(1, "Enimax", 3), p(2, "ENIMAX", 9)], opts);
    expect(plan.keep!.id).toBe(2);
    expect(plan.renameNeeded).toBe(true);
    expect(plan.tasksMoving).toBe(3);
  });

  it("breaks a tie on the oldest row", () => {
    const plan = planMerge([p(7, "ENIMAX", 5), p(2, "Enimax", 5)], opts);
    expect(plan.keep!.id).toBe(2);
  });

  it("refuses to merge across clients — that is a different engagement", () => {
    const plan = planMerge(
      [p(1, "Thermax ENIMAX", 5, 1), p(2, "ENIMAX", 3, 2)],
      opts,
    );
    expect(plan.keep!.id).toBe(1);
    expect(plan.absorb).toEqual([]);
    expect(plan.crossClient.map((x) => x.id)).toEqual([2]);
    expect(plan.tasksMoving).toBe(0);
  });

  it("a single correctly named project is a no-op", () => {
    const plan = planMerge([p(1, "Thermax ENIMAX", 12)], opts);
    expect(plan.keep!.id).toBe(1);
    expect(plan.absorb).toEqual([]);
    expect(plan.tasksMoving).toBe(0);
    expect(plan.renameNeeded).toBe(false);
  });

  it("a single misnamed project is renamed, not deleted", () => {
    const plan = planMerge([p(1, "ENIMAX", 12)], opts);
    expect(plan.keep!.id).toBe(1);
    expect(plan.absorb).toEqual([]);
    expect(plan.renameNeeded).toBe(true);
  });

  it("nothing matching means nothing to do", () => {
    const plan = planMerge([p(1, "Tracker"), p(2, "Conlist")], opts);
    expect(plan.keep).toBeNull();
    expect(plan.absorb).toEqual([]);
    expect(plan.tasksMoving).toBe(0);
  });

  it("never absorbs the survivor into itself", () => {
    const plan = planMerge([p(1, "Enimax", 4), p(2, "ENIMAX", 4)], opts);
    expect(plan.absorb.some((x) => x.id === plan.keep!.id)).toBe(false);
  });

  it("notices a canonical name that differs only in case", () => {
    // Normalises equal, but the stored spelling is still wrong.
    const plan = planMerge([p(1, "THERMAX ENIMAX", 2)], opts);
    expect(plan.renameNeeded).toBe(true);
  });
});

describe("describePlan", () => {
  it("says what would happen, before anything happens", () => {
    const plan = planMerge(
      [p(1, "Enimax", 3), p(2, "Thermax ENIMAX", 1), p(9, "ENIMAX", 2, 5)],
      { canonicalName: "Thermax ENIMAX", token: "enimax" },
    );
    const lines = describePlan(plan, "Thermax ENIMAX").join("\n");
    expect(lines).toContain('keep    #2 "Thermax ENIMAX"');
    expect(lines).toContain('absorb  #1 "Enimax"');
    expect(lines).toContain("SKIP    #9");
    expect(lines).toContain("3 task(s) change project.");
  });

  it("says so when there is nothing to merge", () => {
    const plan = planMerge([], { canonicalName: "Thermax ENIMAX", token: "enimax" });
    expect(describePlan(plan, "Thermax ENIMAX")[0]).toContain("nothing to merge");
  });
});
