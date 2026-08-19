import { describe, it, expect } from "vitest";
import {
  canMarkAttendance,
  canMarkFor,
  canDecide,
  hoursIssue,
  initialStatus,
  isLeaveKind,
  REQUESTABLE_KINDS,
  MAX_HALF_DAY_HOURS,
} from "@/lib/domain-leave";
import { DOMAIN_ROLES, type DomainRole } from "@/lib/domain";

/**
 * The register only means anything if the two rules below hold:
 *   - workers ask, supervisors decide
 *   - nobody decides their own
 */

describe("who may mark attendance", () => {
  it("is the three supervising roles and nobody else", () => {
    expect(canMarkAttendance("Admin")).toBe(true);
    expect(canMarkAttendance("Lead")).toBe(true);
    expect(canMarkAttendance("TeamLead")).toBe(true);
    expect(canMarkAttendance("SME")).toBe(false);
    expect(canMarkAttendance("Actionee")).toBe(false);
  });

  it("an SME or Actionee cannot mark anyone, for any target role", () => {
    for (const worker of ["SME", "Actionee"] as DomainRole[]) {
      for (const target of DOMAIN_ROLES) {
        expect(canMarkFor(worker, target)).toBe(false);
      }
    }
  });

  it("follows the management hierarchy, not a second one", () => {
    // Admin covers everyone.
    for (const target of DOMAIN_ROLES) {
      expect(canMarkFor("Admin", target)).toBe(true);
    }
    // A Lead covers Team Leads and below, but not another Lead or an Admin.
    expect(canMarkFor("Lead", "TeamLead")).toBe(true);
    expect(canMarkFor("Lead", "Actionee")).toBe(true);
    expect(canMarkFor("Lead", "Lead")).toBe(false);
    expect(canMarkFor("Lead", "Admin")).toBe(false);
    // A Team Lead covers only SMEs and Actionees.
    expect(canMarkFor("TeamLead", "SME")).toBe(true);
    expect(canMarkFor("TeamLead", "Actionee")).toBe(true);
    expect(canMarkFor("TeamLead", "TeamLead")).toBe(false);
    expect(canMarkFor("TeamLead", "Lead")).toBe(false);
  });
});

describe("deciding a request", () => {
  it("nobody decides their own — not even an Admin", () => {
    expect(
      canDecide(
        { id: "u1", role: "Admin" },
        { userId: "u1", targetRole: "Admin" },
      ),
    ).toBe(false);
    expect(
      canDecide(
        { id: "u2", role: "TeamLead" },
        { userId: "u2", targetRole: "TeamLead" },
      ),
    ).toBe(false);
  });

  it("a supervisor decides for someone they cover", () => {
    expect(
      canDecide(
        { id: "tl", role: "TeamLead" },
        { userId: "a1", targetRole: "Actionee" },
      ),
    ).toBe(true);
  });

  it("a supervisor cannot decide above their level", () => {
    expect(
      canDecide({ id: "tl", role: "TeamLead" }, { userId: "l1", targetRole: "Lead" }),
    ).toBe(false);
  });

  it("a worker cannot decide anyone's request", () => {
    expect(
      canDecide({ id: "s1", role: "SME" }, { userId: "a1", targetRole: "Actionee" }),
    ).toBe(false);
  });
});

describe("what a worker may request", () => {
  it("is time off only — never their own attendance", () => {
    // "Present" as a request is a claim nobody would refuse, and would
    // hollow out the register.
    expect(REQUESTABLE_KINDS).toEqual(["Half day", "Leave"]);
    expect(REQUESTABLE_KINDS).not.toContain("Present");
    expect(REQUESTABLE_KINDS).not.toContain("Absent");
  });

  it("recognises the kinds it stores, and rejects anything else", () => {
    expect(isLeaveKind("Half day")).toBe(true);
    expect(isLeaveKind("Present")).toBe(true);
    expect(isLeaveKind("Holiday")).toBe(false);
    expect(isLeaveKind(null)).toBe(false);
  });
});

describe("status on arrival", () => {
  it("a supervisor's mark is already decided; a worker's is not", () => {
    expect(initialStatus("Admin")).toBe("Approved");
    expect(initialStatus("Lead")).toBe("Approved");
    expect(initialStatus("TeamLead")).toBe("Approved");
    expect(initialStatus("SME")).toBe("Pending");
    expect(initialStatus("Actionee")).toBe("Pending");
  });
});

describe("half-day hours", () => {
  it("are required for a half day", () => {
    expect(hoursIssue("Half day", null)).toBeTruthy();
    expect(hoursIssue("Half day", "")).toBeTruthy();
    expect(hoursIssue("Half day", 4)).toBeNull();
  });

  it("are refused for every other kind", () => {
    expect(hoursIssue("Present", 8)).toBeTruthy();
    expect(hoursIssue("Leave", 2)).toBeTruthy();
    // Absent with no hours is the normal case and must pass.
    expect(hoursIssue("Absent", null)).toBeNull();
    expect(hoursIssue("Present", undefined)).toBeNull();
  });

  it("must be positive and no more than a half day", () => {
    expect(hoursIssue("Half day", 0)).toBeTruthy();
    expect(hoursIssue("Half day", -1)).toBeTruthy();
    expect(hoursIssue("Half day", MAX_HALF_DAY_HOURS)).toBeNull();
    // Nine hours is not a half day — it's the wrong kind picked.
    expect(hoursIssue("Half day", MAX_HALF_DAY_HOURS + 1)).toBeTruthy();
  });

  it("accepts quarter hours and refuses finer precision", () => {
    expect(hoursIssue("Half day", 3.25)).toBeNull();
    expect(hoursIssue("Half day", 3.5)).toBeNull();
    expect(hoursIssue("Half day", 3.75)).toBeNull();
    expect(hoursIssue("Half day", 3.1)).toBeTruthy();
  });

  it("refuses text that isn't a number", () => {
    expect(hoursIssue("Half day", "abc")).toBeTruthy();
  });
});
