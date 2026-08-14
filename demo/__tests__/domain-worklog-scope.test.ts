import { describe, it, expect } from "vitest";
import { worklogVisibleRoles } from "@/lib/domain";

/**
 * Who may read whose work log. The rule follows the reporting line: you
 * see the people whose work you oversee, never the people who oversee
 * you, and never yourself (the self-exclusion is applied at the query).
 */
describe("work log visibility", () => {
  it("an Admin reads every role", () => {
    const seen = worklogVisibleRoles("Admin");
    expect(seen).toEqual(
      expect.arrayContaining(["Admin", "Lead", "TeamLead", "SME", "Actionee"]),
    );
  });

  it("a Lead reads Team Leads and below, but not Admins or other Leads", () => {
    const seen = worklogVisibleRoles("Lead");
    expect(seen).toEqual(expect.arrayContaining(["TeamLead", "SME", "Actionee"]));
    expect(seen).not.toContain("Admin");
    expect(seen).not.toContain("Lead");
  });

  it("a Team Lead reads SMEs and Actionees only", () => {
    const seen = worklogVisibleRoles("TeamLead");
    expect(seen.slice().sort()).toEqual(["Actionee", "SME"]);
    // Not upwards, and not sideways to another Team Lead.
    expect(seen).not.toContain("Lead");
    expect(seen).not.toContain("Admin");
    expect(seen).not.toContain("TeamLead");
  });

  it("SMEs and Actionees read nobody but themselves", () => {
    expect(worklogVisibleRoles("SME")).toEqual([]);
    expect(worklogVisibleRoles("Actionee")).toEqual([]);
  });

  it("nobody below Admin can read an Admin's log", () => {
    for (const role of ["Lead", "TeamLead", "SME", "Actionee"] as const) {
      expect(worklogVisibleRoles(role)).not.toContain("Admin");
    }
  });

  it("the Admin list is a copy — callers can't mutate the shared roles", () => {
    const seen = worklogVisibleRoles("Admin");
    seen.pop();
    expect(worklogVisibleRoles("Admin")).toHaveLength(5);
  });
});
