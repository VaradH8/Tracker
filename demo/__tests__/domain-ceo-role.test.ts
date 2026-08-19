import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DOMAIN_ROLES,
  DOMAIN_ROLE_LABELS,
  PORTFOLIO_VIEWER_ROLES,
  SUPERVISOR_ROLES,
  TAG_HOLDER_ROLES,
  WORKING_ROLES,
  assignableRoles,
  canAssignTasks,
  canManageUser,
  manageableRoles,
  needsReview,
} from "@/lib/domain";
import { canMarkAttendance, canMarkFor, canDecide } from "@/lib/domain-leave";

/**
 * The CEO role exists to see everything and change nothing.
 *
 * These tests are the guard on that sentence. The failure mode being
 * prevented is a later change widening SUPERVISOR_ROLES "to let the CEO
 * see X" and silently handing them approval of the delivery figures they
 * are meant to be judging.
 */

describe("what a CEO may see", () => {
  it("can read the whole portfolio", () => {
    expect(PORTFOLIO_VIEWER_ROLES).toContain("CEO");
  });

  /**
   * Read the route source rather than restate the constant.
   *
   * Asserting PORTFOLIO_VIEWER_ROLES contains "CEO" a second time would
   * pass whatever the simulate endpoint actually does. What needs
   * pinning is which gate that endpoint chose — and that it stays a
   * read, since the whole justification for opening it is that it writes
   * nothing.
   */
  it("runs simulations through the viewer gate, and simulation stays a read", () => {
    const src = readFileSync(
      resolve(__dirname, "../app/api/domain/forecast/simulate/route.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /requireDomainRole\(\s*userOrResp\s*,\s*PORTFOLIO_VIEWER_ROLES\s*\)/,
    );
    expect(src).not.toMatch(/requireDomainRole\([^)]*SUPERVISOR_ROLES/);
    // No write may appear on a path an executive can reach.
    expect(src).not.toMatch(
      /prisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)/,
    );
  });

  it("portfolio viewers are a superset of supervisors, never a replacement", () => {
    // Everyone who supervised before must still be able to read.
    for (const r of SUPERVISOR_ROLES) {
      expect(PORTFOLIO_VIEWER_ROLES).toContain(r);
    }
  });
});

describe("what a CEO may NOT do", () => {
  it("is not a supervisor — approvals and password resets stay shut", () => {
    // SUPERVISOR_ROLES gates approving submissions, booking people and
    // resetting passwords. A CEO must never appear in it.
    expect(SUPERVISOR_ROLES).not.toContain("CEO");
  });

  it("cannot assign tasks to anybody", () => {
    expect(assignableRoles("CEO")).toEqual([]);
    expect(canAssignTasks("CEO")).toBe(false);
  });

  it("cannot be assigned tasks by anybody", () => {
    // No role's assignable list may offer the CEO as a target.
    for (const role of DOMAIN_ROLES) {
      expect(assignableRoles(role)).not.toContain("CEO");
    }
  });

  it("cannot manage any account", () => {
    expect(manageableRoles("CEO")).toEqual([]);
    for (const target of DOMAIN_ROLES) {
      expect(canManageUser("CEO", target)).toBe(false);
    }
  });

  it("cannot mark or decide attendance", () => {
    expect(canMarkAttendance("CEO")).toBe(false);
    for (const target of DOMAIN_ROLES) {
      expect(canMarkFor("CEO", target)).toBe(false);
    }
    expect(
      canDecide({ id: "ceo", role: "CEO" }, { userId: "a", targetRole: "Actionee" }),
    ).toBe(false);
  });
});

describe("a CEO is not a resource", () => {
  it("never appears as someone who does the work", () => {
    // Both lists drive "who can be booked" and "who shows in resource
    // availability". A CEO in either would show up as capacity.
    expect(WORKING_ROLES).not.toContain("CEO");
    expect(TAG_HOLDER_ROLES).not.toContain("CEO");
  });
});

describe("the role is wired up completely", () => {
  it("is a known role with a label", () => {
    expect(DOMAIN_ROLES).toContain("CEO");
    expect(DOMAIN_ROLE_LABELS.CEO).toBe("CEO");
  });

  it("every role has a label — no gaps left by adding one", () => {
    for (const r of DOMAIN_ROLES) {
      expect(DOMAIN_ROLE_LABELS[r]).toBeTruthy();
    }
  });

  it("an Admin can create and manage a CEO account", () => {
    // Somebody has to be able to set the account up, and that is the
    // Admin — not the CEO themselves.
    expect(canManageUser("Admin", "CEO")).toBe(true);
    expect(canManageUser("Lead", "CEO")).toBe(false);
    expect(canManageUser("TeamLead", "CEO")).toBe(false);
  });

  it("needsReview answers for a CEO without throwing", () => {
    // A CEO never submits tags, but the function must still be total —
    // an unhandled role here would crash a submission path.
    expect(typeof needsReview("CEO")).toBe("boolean");
  });
});
