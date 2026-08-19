import { describe, it, expect } from "vitest";
import {
  assignableRoles,
  needsReview,
  submissionNeedsReview,
  worklogVisibleRoles,
} from "@/lib/domain";

/**
 * Leads and Team Leads may hand tags to themselves and to their peers.
 *
 * The capability is deliberate — they carry delivery on the projects they
 * run, and taking a batch should not require asking an Admin. What must
 * not follow from it is a delivery figure that one person scoped, claimed
 * and approved with nobody else in the chain.
 */

describe("who may be handed tags", () => {
  it("lets a Lead take tags themselves and give them to a peer", () => {
    expect(assignableRoles("Lead")).toContain("Lead");
  });

  it("lets a Team Lead do the same at their own level", () => {
    expect(assignableRoles("TeamLead")).toContain("TeamLead");
  });

  it("still refuses upward", () => {
    expect(assignableRoles("TeamLead")).not.toContain("Lead");
    expect(assignableRoles("TeamLead")).not.toContain("Admin");
    expect(assignableRoles("Lead")).not.toContain("Admin");
  });

  it("still gives SMEs and Actionees nobody to assign to", () => {
    expect(assignableRoles("SME")).toEqual([]);
    expect(assignableRoles("Actionee")).toEqual([]);
  });
});

describe("what has to be signed off by somebody else", () => {
  it("records a Lead's assigned-from-above work on the spot, as before", () => {
    expect(
      submissionNeedsReview({ assigneeRole: "Lead", selfAssigned: false }),
    ).toBe(false);
    expect(
      submissionNeedsReview({ assigneeRole: "TeamLead", selfAssigned: false }),
    ).toBe(false);
  });

  it("holds self-assigned tags for review, whatever the role", () => {
    // The whole point: without this, a Lead could set their own target,
    // claim against it and have it counted as delivered, with nothing in
    // the chain anybody else touched.
    for (const role of ["Admin", "Lead", "TeamLead", "SME", "Actionee"] as const) {
      expect(submissionNeedsReview({ assigneeRole: role, selfAssigned: true })).toBe(
        true,
      );
    }
  });

  it("still reviews SMEs and Actionees either way", () => {
    for (const selfAssigned of [true, false]) {
      expect(submissionNeedsReview({ assigneeRole: "SME", selfAssigned })).toBe(true);
      expect(
        submissionNeedsReview({ assigneeRole: "Actionee", selfAssigned }),
      ).toBe(true);
    }
  });

  it("leaves the role-only rule alone for everything else that uses it", () => {
    expect(needsReview("Lead")).toBe(false);
    expect(needsReview("SME")).toBe(true);
  });
});

describe("what assigning to a peer does not grant", () => {
  it("does not hand over their work log", () => {
    // Sharing delivery with a peer and reading their timesheet are
    // different permissions; widening one must not widen the other.
    expect(worklogVisibleRoles("Lead")).not.toContain("Lead");
    expect(worklogVisibleRoles("TeamLead")).not.toContain("TeamLead");
  });

  it("still lets you read the log of anyone you assign work down to", () => {
    for (const role of ["Admin", "Lead", "TeamLead"] as const) {
      const visible = worklogVisibleRoles(role);
      for (const target of assignableRoles(role).filter((r) => r !== role)) {
        expect(visible).toContain(target);
      }
    }
  });
});
