import { describe, it, expect } from "vitest";
import { canManageUser, manageableRoles, DOMAIN_ROLES } from "@/lib/domain";

/**
 * Who may administer whose account.
 *
 * Regression cover for a privilege escalation: creating an Admin was
 * blocked for a Lead, but *promoting* someone to Admin was not, because
 * the rule was written inline at the create and delete endpoints and
 * simply forgotten on the edit endpoint. A Lead could PATCH any account —
 * including their own — to Admin.
 *
 * The rule now lives in one place and is tested here, so the same gap
 * cannot reopen on a fourth endpoint.
 */
describe("account administration rights", () => {
  it("an Admin may administer every role, including other Admins", () => {
    for (const target of DOMAIN_ROLES) {
      expect(canManageUser("Admin", target)).toBe(true);
    }
  });

  it("a Lead may administer their own team and nobody above it", () => {
    expect(manageableRoles("Lead").slice().sort()).toEqual([
      "Actionee",
      "SME",
      "TeamLead",
    ]);
    expect(canManageUser("Lead", "TeamLead")).toBe(true);
    expect(canManageUser("Lead", "SME")).toBe(true);
    expect(canManageUser("Lead", "Actionee")).toBe(true);
  });

  it("a Lead can neither touch an Admin nor another Lead", () => {
    expect(canManageUser("Lead", "Admin")).toBe(false);
    expect(canManageUser("Lead", "Lead")).toBe(false);
  });

  it("a Lead cannot grant the Admin or Lead role", () => {
    // The same predicate guards the role being handed out, which is what
    // stops "promote to Admin" from being a way around the create check.
    expect(canManageUser("Lead", "Admin")).toBe(false);
    expect(canManageUser("Lead", "Lead")).toBe(false);
  });

  it("a Team Lead administers the people they supervise", () => {
    // Widened deliberately: a Team Lead edits SMEs and Actionees. They
    // still cannot CREATE or DELETE an account — that is enforced at the
    // routes, which admit only Admin and Lead to POST and DELETE.
    expect(manageableRoles("TeamLead").slice().sort()).toEqual([
      "Actionee",
      "SME",
    ]);
    expect(canManageUser("TeamLead", "SME")).toBe(true);
    expect(canManageUser("TeamLead", "Actionee")).toBe(true);
  });

  it("a Team Lead cannot touch a Lead, an Admin, or another Team Lead", () => {
    for (const target of ["Admin", "Lead", "TeamLead"] as const) {
      expect(canManageUser("TeamLead", target)).toBe(false);
    }
  });

  it("SMEs and Actionees administer nobody at all", () => {
    for (const actor of ["SME", "Actionee"] as const) {
      expect(manageableRoles(actor)).toEqual([]);
      for (const target of DOMAIN_ROLES) {
        expect(canManageUser(actor, target)).toBe(false);
      }
    }
  });

  it("nobody below Admin can hand out Admin", () => {
    for (const actor of ["Lead", "TeamLead", "SME", "Actionee"] as const) {
      expect(canManageUser(actor, "Admin")).toBe(false);
    }
  });
});
