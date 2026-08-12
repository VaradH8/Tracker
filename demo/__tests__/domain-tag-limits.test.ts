import { describe, it, expect } from "vitest";
import { assignmentCapIssue, divisionTagsIssue } from "@/lib/domain";

/**
 * The two ceilings that keep a project's tag numbers honest: divisions
 * can't promise more than the project holds, and people can't be handed
 * more than the division (or project) has left.
 */

describe("divisionTagsIssue", () => {
  it("accepts divisions that fit inside the project total", () => {
    expect(divisionTagsIssue(6000, [4000, 2000])).toBeNull();
    expect(divisionTagsIssue(6000, [100])).toBeNull();
  });

  it("accepts divisions that exactly use up the total", () => {
    expect(divisionTagsIssue(6000, [3000, 3000])).toBeNull();
  });

  it("blocks divisions that add up to more than the project has", () => {
    const issue = divisionTagsIssue(6000, [4000, 2500]);
    expect(issue).toMatch(/6500/);
    expect(issue).toMatch(/6000/);
  });

  it("blocks a single division larger than the whole project", () => {
    expect(divisionTagsIssue(6000, [6001])).not.toBeNull();
  });

  it("stays out of the way when no project total is set", () => {
    // 0 means "not declared yet" — there's no budget to police.
    expect(divisionTagsIssue(0, [4000, 2000])).toBeNull();
  });
});

describe("assignmentCapIssue", () => {
  it("allows an assignment that fits in what's left", () => {
    expect(assignmentCapIssue(100, 40, 60, "division")).toBeNull();
  });

  it("blocks handing out more than remains", () => {
    const issue = assignmentCapIssue(100, 40, 61, "division");
    expect(issue).toMatch(/Only 60/);
  });

  it("says so plainly when nothing is left", () => {
    const issue = assignmentCapIssue(100, 100, 1, "division");
    expect(issue).toMatch(/already assigned/);
  });

  it("stays out of the way when no cap is set", () => {
    expect(assignmentCapIssue(0, 0, 999, "project")).toBeNull();
  });

  it("names the level it's talking about", () => {
    expect(assignmentCapIssue(10, 10, 1, "project")).toMatch(/project/);
    expect(assignmentCapIssue(10, 10, 1, "division")).toMatch(/division/);
  });
});
