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

  it("a Lead reaches Team Leads and below, but not an Admin or another Lead", () => {
    const r = assignableRoles("Lead");
    expect(r).toEqual(["TeamLead", "SME", "Actionee"]);
    expect(r).not.toContain("Admin");
    expect(r).not.toContain("Lead");
  });

  it("a Team Lead reaches SMEs and Actionees only", () => {
    const r = assignableRoles("TeamLead");
    expect(r.slice().sort()).toEqual(["Actionee", "SME"]);
    // Not sideways to a peer, which would leave the reviewer ambiguous.
    expect(r).not.toContain("TeamLead");
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

  it("assignability and work-log visibility stay in step", () => {
    // You should never be able to task someone whose result you can't
    // then read. Every assignable role must also be readable.
    for (const role of ["Admin", "Lead", "TeamLead"] as const) {
      const visible = worklogVisibleRoles(role);
      for (const target of assignableRoles(role)) {
        expect(visible).toContain(target);
      }
    }
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
