import { describe, it, expect } from "vitest";
import {
  canApproveLeave,
  leaveApprovalRefusal,
  leaveApproverLabel,
} from "@/lib/leave-access";
import type { Role } from "@/lib/role";

function party(id: string, role: Role) {
  return { id, role };
}

describe("canApproveLeave", () => {
  it("nobody below Admin can approve their own leave", () => {
    for (const role of ["Lead", "Coordinator", "Developer", "BusinessDeveloper"] as Role[]) {
      const me = party("me", role);
      expect(canApproveLeave(me, me)).toBe(false);
    }
  });

  it("a Coordinator approves Developer and BD leave, not a peer Coordinator", () => {
    const coord = party("c1", "Coordinator");
    expect(canApproveLeave(coord, party("d1", "Developer"))).toBe(true);
    expect(canApproveLeave(coord, party("b1", "BusinessDeveloper"))).toBe(true);
    expect(canApproveLeave(coord, party("c2", "Coordinator"))).toBe(false);
    expect(canApproveLeave(coord, party("l1", "Lead"))).toBe(false);
    expect(canApproveLeave(coord, party("a1", "Admin"))).toBe(false);
  });

  it("a Lead approves Coordinator leave but not another Lead's", () => {
    const lead = party("l1", "Lead");
    expect(canApproveLeave(lead, party("c1", "Coordinator"))).toBe(true);
    expect(canApproveLeave(lead, party("d1", "Developer"))).toBe(true);
    expect(canApproveLeave(lead, party("l2", "Lead"))).toBe(false);
  });

  it("an Admin approves anyone's leave, including their own", () => {
    const admin = party("a1", "Admin");
    expect(canApproveLeave(admin, admin)).toBe(true);
    expect(canApproveLeave(admin, party("a2", "Admin"))).toBe(true);
    expect(canApproveLeave(admin, party("l1", "Lead"))).toBe(true);
    expect(canApproveLeave(admin, party("c1", "Coordinator"))).toBe(true);
  });

  it("Developers and BDs approve nobody", () => {
    expect(canApproveLeave(party("d1", "Developer"), party("d2", "Developer"))).toBe(false);
    expect(canApproveLeave(party("b1", "BusinessDeveloper"), party("d2", "Developer"))).toBe(false);
  });

  it("an unknown role stored in the database never gets approval rights", () => {
    const weird = party("x", "Intern" as Role);
    expect(canApproveLeave(weird, party("d1", "Developer"))).toBe(false);
    // …but a Coordinator can still decide such a request.
    expect(canApproveLeave(party("c1", "Coordinator"), weird)).toBe(true);
  });
});

describe("copy helpers", () => {
  it("explains a refusal", () => {
    const me = party("me", "Coordinator");
    expect(leaveApprovalRefusal(me, me)).toMatch(/own leave/);
    expect(leaveApprovalRefusal(me, party("c2", "Coordinator"))).toMatch(/senior/);
  });

  it("tells the requester who will see their request", () => {
    expect(leaveApproverLabel("Developer")).toBe("Your co-ordinator");
    expect(leaveApproverLabel("Coordinator")).toBe("Your lead or an admin");
    expect(leaveApproverLabel("Lead")).toBe("An admin");
  });
});
