import { describe, it, expect } from "vitest";
import {
  assignableRoles,
  canAssignTasks,
  normaliseTaskStatus,
  taskIsOpen,
  TAG_HOLDER_ROLES,
  normaliseComplexity,
  worklogVisibleRoles,
} from "@/lib/domain";

/**
 * Tasks are handed down a hierarchy, submitted by the person doing them,
 * and signed off by whoever handed them out. The rules that matter are
 * who may task whom, and what counts as still outstanding.
 */
/**
 * `assignableRoles` governs TAG assignment. Tasks are deliberately
 * unrestricted — anyone can be given one, and accountability comes from
 * approval returning to the assigner instead.
 */
describe("who can assign a tag to whom", () => {
  it("an Admin can assign to everyone below, including a Lead", () => {
    expect(assignableRoles("Admin")).toEqual([
      "Lead",
      "TeamLead",
      "SME",
      "Actionee",
    ]);
  });

  it("a Lead reaches other Leads and below, but never an Admin", () => {
    const r = assignableRoles("Lead");
    expect(r.slice().sort()).toEqual(["Actionee", "Lead", "SME", "TeamLead"]);
    // Sideways and to oneself is deliberate: a Lead carries delivery on
    // the projects they run, so taking a batch of tags should not need an
    // Admin. Upward is still refused.
    expect(r).toContain("Lead");
    expect(r).not.toContain("Admin");
  });

  it("a Team Lead reaches other Team Leads and below, but no higher", () => {
    const r = assignableRoles("TeamLead");
    expect(r.slice().sort()).toEqual(["Actionee", "SME", "TeamLead"]);
    expect(r).toContain("TeamLead");
    expect(r).not.toContain("Lead");
    expect(r).not.toContain("Admin");
  });

  it("SMEs and Actionees cannot hand out work at all", () => {
    expect(assignableRoles("SME")).toEqual([]);
    expect(assignableRoles("Actionee")).toEqual([]);
    expect(canAssignTasks("SME")).toBe(false);
    expect(canAssignTasks("Actionee")).toBe(false);
  });

  it("nobody can assign upwards", () => {
    expect(assignableRoles("Lead")).not.toContain("Admin");
    expect(assignableRoles("TeamLead")).not.toContain("Lead");
    expect(assignableRoles("TeamLead")).not.toContain("Admin");
  });

  it("work handed DOWN is always readable by whoever handed it out", () => {
    // The property that matters: you cannot push work onto somebody you
    // supervise and then be unable to see what they did with it.
    //
    // Peers and oneself are deliberately outside this. A Lead may now
    // take tags themselves or give them to another Lead, and neither
    // grants them that person's hours log — reading a peer's timesheet is
    // a different permission from sharing delivery with them, and
    // widening one should not quietly widen the other. The delivery
    // itself stays visible either way: tag submissions are not
    // self-scoped for Leads and above.
    for (const role of ["Admin", "Lead", "TeamLead"] as const) {
      const visible = worklogVisibleRoles(role);
      const below = assignableRoles(role).filter((r) => r !== role);
      for (const target of below) {
        expect(visible).toContain(target);
      }
    }
  });

  it("assigning to a peer does not hand over their work log", () => {
    expect(assignableRoles("Lead")).toContain("Lead");
    expect(worklogVisibleRoles("Lead")).not.toContain("Lead");
    expect(assignableRoles("TeamLead")).toContain("TeamLead");
    expect(worklogVisibleRoles("TeamLead")).not.toContain("TeamLead");
  });
});

describe("who can hold work", () => {
  it("includes Leads, because an Admin may assign to one", () => {
    expect(TAG_HOLDER_ROLES).toContain("Lead");
  });

  it("excludes Admins — they run the module, they don't carry delivery", () => {
    expect(TAG_HOLDER_ROLES).not.toContain("Admin");
  });

  it("covers every role anyone can assign to", () => {
    // If someone can be given work, planning has to be able to see it.
    // A gap here is how a person ends up Free while carrying open tags.
    for (const role of ["Admin", "Lead", "TeamLead"] as const) {
      for (const target of assignableRoles(role)) {
        expect(TAG_HOLDER_ROLES).toContain(target);
      }
    }
  });
});

describe("task status", () => {
  it("a task is open until it is approved", () => {
    expect(taskIsOpen("Assigned")).toBe(true);
    // Sent back means "do it again", so it is still outstanding.
    expect(taskIsOpen("Rejected")).toBe(true);
    expect(taskIsOpen("Submitted")).toBe(false);
    expect(taskIsOpen("Approved")).toBe(false);
  });

  it("statuses from before this flow fold into Assigned", () => {
    // Rows created under the old free-floating statuses must not render
    // as an unknown state.
    expect(normaliseTaskStatus("To Do")).toBe("Assigned");
    expect(normaliseTaskStatus("In Progress")).toBe("Assigned");
    expect(normaliseTaskStatus("")).toBe("Assigned");
    expect(normaliseTaskStatus("nonsense")).toBe("Assigned");
  });

  it("the real statuses pass through untouched", () => {
    for (const s of ["Assigned", "Submitted", "Approved", "Rejected"] as const) {
      expect(normaliseTaskStatus(s)).toBe(s);
    }
  });
});

describe("tag complexity", () => {
  it("recognises the two real values", () => {
    expect(normaliseComplexity("Simple")).toBe("Simple");
    expect(normaliseComplexity("Complex")).toBe("Complex");
  });

  it("defaults to Simple when nothing was chosen", () => {
    // An untouched dropdown, a missing field and a legacy row all have to
    // land on the same answer, or reports would split hairs over nothing.
    expect(normaliseComplexity(undefined)).toBe("Simple");
    expect(normaliseComplexity(null)).toBe("Simple");
    expect(normaliseComplexity("")).toBe("Simple");
  });

  it("refuses to invent a third category", () => {
    expect(normaliseComplexity("Medium")).toBe("Simple");
    expect(normaliseComplexity("COMPLEX")).toBe("Simple");
    expect(normaliseComplexity(42)).toBe("Simple");
  });
});
