import { describe, it, expect } from "vitest";
import {
  approverLabel,
  approverRoles,
  canDecide,
  canMarkFor,
  canSeeLeaveOf,
} from "@/lib/domain-leave";
import { DOMAIN_ROLES, type DomainRole } from "@/lib/domain";

/**
 * Where a request goes.
 *
 * A Lead's or a Team Lead's own leave is signed off by an Admin, and only
 * by an Admin — a Lead approving the Team Lead who reports to them, on a
 * project they both deliver, is a negotiation dressed as a decision.
 * SMEs and Actionees go to their Team Lead or Lead.
 *
 * Reading the register is a separate, wider question, and the two must not
 * be collapsed back into one test.
 */

const WORKERS: DomainRole[] = ["SME", "Actionee"];
const SUPERVISORS: DomainRole[] = ["Lead", "TeamLead"];

describe("approverRoles", () => {
  it("sends a Lead's and a Team Lead's own leave to an Admin only", () => {
    for (const r of SUPERVISORS) {
      expect(approverRoles(r)).toEqual(["Admin"]);
    }
  });

  it("sends a worker's leave to their team lead or lead, with Admin behind", () => {
    for (const r of WORKERS) {
      expect(approverRoles(r).sort()).toEqual(["Admin", "Lead", "TeamLead"]);
    }
  });

  it("never leaves a role with nobody to approve it", () => {
    for (const r of DOMAIN_ROLES) {
      expect(approverRoles(r).length).toBeGreaterThan(0);
      expect(approverRoles(r)).toContain("Admin");
    }
  });

  it("says who a request is with, in words", () => {
    expect(approverLabel("TeamLead")).toBe("an admin");
    expect(approverLabel("Actionee")).toBe("a team lead, lead or admin");
  });
});

describe("who may decide", () => {
  it("stops a Lead signing off their own Team Lead's leave", () => {
    // The regression this whole change exists to prevent. canMarkFor still
    // says yes — a Lead does cover a Team Lead — so only the routing
    // catches it, and it has to be checked as well as, not instead of.
    expect(canMarkFor("Lead", "TeamLead")).toBe(true);
    expect(
      canDecide({ id: "l1", role: "Lead" }, { userId: "t1", targetRole: "TeamLead" }),
    ).toBe(false);
  });

  it("gives a Team Lead's leave to an Admin", () => {
    expect(
      canDecide({ id: "a1", role: "Admin" }, { userId: "t1", targetRole: "TeamLead" }),
    ).toBe(true);
  });

  it("gives a Lead's leave to an Admin", () => {
    expect(
      canDecide({ id: "a1", role: "Admin" }, { userId: "l1", targetRole: "Lead" }),
    ).toBe(true);
  });

  it("still lets a Team Lead and a Lead decide for SMEs and Actionees", () => {
    for (const actor of SUPERVISORS) {
      for (const target of WORKERS) {
        expect(
          canDecide({ id: "x", role: actor }, { userId: "y", targetRole: target }),
        ).toBe(true);
      }
    }
  });

  it("still refuses everybody their own request", () => {
    for (const role of DOMAIN_ROLES) {
      expect(
        canDecide({ id: "same", role }, { userId: "same", targetRole: role }),
      ).toBe(false);
    }
  });

  it("gives a worker nobody to decide for", () => {
    for (const actor of WORKERS) {
      for (const target of DOMAIN_ROLES) {
        expect(
          canDecide({ id: "w", role: actor }, { userId: "z", targetRole: target }),
        ).toBe(false);
      }
    }
  });
});

describe("who may read the register", () => {
  it("keeps Team Leads in their Lead's history even though an Admin decides them", () => {
    // The trap in this change: deciding and reading used to be one test,
    // so narrowing the approval would silently have emptied the Lead's
    // register of the people they run.
    const lead = { id: "l1", role: "Lead" as const };
    const tl = { id: "t1", role: "TeamLead" as const };
    expect(canDecide(lead, { userId: tl.id, targetRole: tl.role })).toBe(false);
    expect(canSeeLeaveOf(lead, tl)).toBe(true);
  });

  it("shows everyone their own rows, whatever their role", () => {
    for (const role of DOMAIN_ROLES) {
      expect(canSeeLeaveOf({ id: "me", role }, { id: "me", role })).toBe(true);
    }
  });

  it("keeps one worker out of another's register", () => {
    expect(
      canSeeLeaveOf(
        { id: "s1", role: "SME" },
        { id: "a1", role: "Actionee" },
      ),
    ).toBe(false);
    expect(
      canSeeLeaveOf(
        { id: "a1", role: "Actionee" },
        { id: "a2", role: "Actionee" },
      ),
    ).toBe(false);
  });

  it("keeps a Team Lead out of a Lead's register", () => {
    expect(
      canSeeLeaveOf({ id: "t1", role: "TeamLead" }, { id: "l1", role: "Lead" }),
    ).toBe(false);
  });

  it("shows an Admin everyone", () => {
    for (const role of DOMAIN_ROLES) {
      expect(canSeeLeaveOf({ id: "a1", role: "Admin" }, { id: "z", role })).toBe(
        true,
      );
    }
  });
});
