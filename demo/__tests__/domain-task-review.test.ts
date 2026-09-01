import { describe, it, expect } from "vitest";
import {
  canDecide,
  canSubmit,
  cleanReviewerIds,
  isReviewer,
  resetsOtherReviewers,
  reviewSummary,
  statusOnDecision,
  statusOnSubmit,
  type Reviewer,
} from "@/lib/domain-task-review";
import {
  DOMAIN_TASK_PRIORITIES,
  normaliseTaskPriority,
  taskPriorityRank,
} from "@/lib/domain";

/**
 * Any one reviewer approving closes a task.
 *
 * That is the rule the business asked for, and it has one weakness worth
 * testing hard: two of three reviewers may never look at anything, so a
 * closed task can appear thoroughly checked when one person read it. The
 * summary has to keep saying so.
 *
 * The other half is what a send-back does. It returns the task to be
 * redone rather than closing it, and it wipes every decision — because
 * with any-one-approves, a single stale approval left behind would close
 * the task the instant it was resubmitted, without anybody reading the
 * correction.
 */

const r = (userId: string, decision: Reviewer["decision"] = "Pending", name?: string): Reviewer => ({
  userId,
  name: name ?? userId,
  decision,
});

describe("submitting", () => {
  it("closes a task nobody was asked to review", () => {
    // "Assign it to myself and get on with it" — no queue to sit in.
    expect(statusOnSubmit([])).toBe("Approved");
  });

  it("waits when somebody was asked", () => {
    expect(statusOnSubmit([r("a")])).toBe("Submitted");
    expect(statusOnSubmit([r("a"), r("b"), r("c")])).toBe("Submitted");
  });

  it("is the assignee's to do, and nobody else's", () => {
    expect(canSubmit("me", "me", "Assigned")).toBe(true);
    // A reviewer submitting on their behalf would be signing off their own
    // submission a moment later.
    expect(canSubmit("me", "reviewer", "Assigned")).toBe(false);
    expect(canSubmit(null, "anyone", "Assigned")).toBe(false);
  });

  it("can be done again after a send-back", () => {
    expect(canSubmit("me", "me", "Rejected")).toBe(true);
  });

  it("cannot be done twice, or after approval", () => {
    expect(canSubmit("me", "me", "Submitted")).toBe(false);
    expect(canSubmit("me", "me", "Approved")).toBe(false);
  });
});

describe("deciding", () => {
  const three = [r("a"), r("b"), r("c")];

  it("lets any named reviewer decide", () => {
    for (const who of ["a", "b", "c"]) {
      expect(canDecide(three, who, "Submitted")).toBe(true);
    }
  });

  it("refuses somebody who was not asked", () => {
    expect(canDecide(three, "stranger", "Submitted")).toBe(false);
    expect(isReviewer(three, "stranger")).toBe(false);
  });

  it("refuses a task that is not waiting on a decision", () => {
    // Otherwise a second reviewer pressing approve on a closed task would
    // move "decided by" to whoever was slowest.
    expect(canDecide(three, "a", "Approved")).toBe(false);
    expect(canDecide(three, "a", "Assigned")).toBe(false);
    expect(canDecide(three, "a", "Rejected")).toBe(false);
  });

  it("closes the task on one approval", () => {
    expect(statusOnDecision("Approved")).toBe("Approved");
  });

  it("sends it back to be redone rather than closing it", () => {
    // A terminal Rejected would mean raising the whole task again to say
    // "fix the one sheet".
    expect(statusOnDecision("Rejected")).toBe("Assigned");
  });

  it("wipes every other decision only on a send-back", () => {
    expect(resetsOtherReviewers("Rejected")).toBe(true);
    expect(resetsOtherReviewers("Approved")).toBe(false);
  });
});

describe("what the record says afterwards", () => {
  it("names the one who decided and the ones who did not", () => {
    // The whole point. Three reviewers, one opinion — and it says so.
    const s = reviewSummary([
      r("a", "Approved", "Lead"),
      r("b", "Pending", "Admin"),
      r("c", "Pending", "Team Lead"),
    ]);
    expect(s.total).toBe(3);
    expect(s.decidedBy).toBe("Lead");
    expect(s.decision).toBe("Approved");
    expect(s.untouched).toEqual(["Admin", "Team Lead"]);
  });

  it("lists who it is waiting on while nobody has decided", () => {
    const s = reviewSummary([r("a", "Pending", "Lead"), r("b", "Pending", "Admin")]);
    expect(s.decidedBy).toBeNull();
    expect(s.waitingOn).toEqual(["Lead", "Admin"]);
    // Nobody has skipped it yet — they simply have not got to it.
    expect(s.untouched).toEqual([]);
  });

  it("reports a send-back as the deciding act too", () => {
    const s = reviewSummary([r("a", "Rejected", "Lead"), r("b", "Pending", "Admin")]);
    expect(s.decision).toBe("Rejected");
    expect(s.decidedBy).toBe("Lead");
  });

  it("says nothing about a task nobody was asked to review", () => {
    const s = reviewSummary([]);
    expect(s).toMatchObject({ total: 0, decidedBy: null, decision: null });
    expect(s.waitingOn).toEqual([]);
  });
});

describe("cleaning up who was named", () => {
  it("drops duplicates rather than failing on the unique constraint", () => {
    expect(cleanReviewerIds(["a", "a", "b"], null)).toEqual(["a", "b"]);
  });

  it("refuses to let somebody review their own work", () => {
    // Otherwise "assign to yourself, name yourself" closes anything
    // instantly while looking reviewed.
    expect(cleanReviewerIds(["me", "other"], "me")).toEqual(["other"]);
  });

  it("survives junk", () => {
    expect(cleanReviewerIds(undefined, null)).toEqual([]);
    expect(cleanReviewerIds("nope", null)).toEqual([]);
    expect(cleanReviewerIds([1, null, "", "  ", "ok"], null)).toEqual(["ok"]);
  });

  it("trims, so a pasted id with a space still matches the assignee", () => {
    expect(cleanReviewerIds([" me ", "other"], "me")).toEqual(["other"]);
  });
});

describe("the assigner can sign off too", () => {
  const CREATOR = "u-creator";
  const REVIEWER = "u-reviewer";
  const named = [{ userId: REVIEWER, decision: "Pending" as const }];

  it("lets whoever assigned it approve, alongside the reviewer", () => {
    // The point of the change: naming a reviewer ADDS somebody who can
    // close the task. It does not hand the job over and lock the assigner
    // out, which stranded tasks whenever the named reviewer was away.
    expect(canDecide(named, REVIEWER, "Submitted", CREATOR)).toBe(true);
    expect(canDecide(named, CREATOR, "Submitted", CREATOR)).toBe(true);
  });

  it("still shuts out everybody else", () => {
    // Including an Admin. A name against a review that never happened is
    // exactly what the reviewer list exists to prevent.
    expect(canDecide(named, "u-passerby", "Submitted", CREATOR)).toBe(false);
  });

  it("holds the status rule for the assigner as well as the reviewer", () => {
    // Otherwise a creator pressing approve on an already-closed task would
    // move the "decided by" name to whoever was slowest.
    expect(canDecide(named, CREATOR, "Approved", CREATOR)).toBe(false);
    expect(canDecide(named, CREATOR, "Assigned", CREATOR)).toBe(false);
    expect(canDecide(named, CREATOR, "Rejected", CREATOR)).toBe(false);
  });

  it("does not treat a missing creator as a match", () => {
    // A null createdById must never satisfy the check by accident.
    expect(canDecide(named, "", "Submitted", null)).toBe(false);
    expect(canDecide(named, "u-anyone", "Submitted", undefined)).toBe(false);
  });

  it("leaves the no-reviewer case alone", () => {
    // Nobody named still means the task closes on submission, so there is
    // no decision for anyone to make — see statusOnSubmit.
    expect(statusOnSubmit([])).toBe("Approved");
    expect(statusOnSubmit(named)).toBe("Submitted");
  });
});

describe("priority", () => {
  it("has three levels, most urgent first", () => {
    // The array IS the sort order, so nothing has to keep a second list of
    // ranks in step with this one.
    expect([...DOMAIN_TASK_PRIORITIES]).toEqual(["High", "Medium", "Low"]);
    expect(taskPriorityRank("High")).toBeLessThan(taskPriorityRank("Medium"));
    expect(taskPriorityRank("Medium")).toBeLessThan(taskPriorityRank("Low"));
  });

  it("lands anything unrecognised on Medium rather than refusing it", () => {
    // A bad priority is not a reason to reject somebody's task, and null
    // would split every sorted list into ranked and unranked halves.
    expect(normaliseTaskPriority("Critical")).toBe("Medium");
    expect(normaliseTaskPriority(null)).toBe("Medium");
    expect(normaliseTaskPriority(undefined)).toBe("Medium");
    expect(normaliseTaskPriority("")).toBe("Medium");
    expect(normaliseTaskPriority(7)).toBe("Medium");
  });

  it("takes whatever case and spacing it is given", () => {
    // The value arrives from a request body, not only from our own buttons.
    expect(normaliseTaskPriority("high")).toBe("High");
    expect(normaliseTaskPriority("  LOW  ")).toBe("Low");
  });

  it("ranks an unknown priority last, not first", () => {
    // Sorting must never float junk to the top of a list of urgent work.
    expect(taskPriorityRank("nonsense")).toBe(taskPriorityRank("Medium"));
  });
});
