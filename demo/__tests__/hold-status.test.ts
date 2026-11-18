import { describe, it, expect } from "vitest";
import {
  isActiveWork,
  isCarriedForward,
  isClosed,
  isEvaluated,
  isOnHold,
  projectProgress,
  taskInRange,
  taskInWeek,
  weekNumberOf,
  type Task,
} from "@/lib/mock";
import { completedAtUpdate, isReopen } from "@/lib/server-access";
import { overdueDaysFor } from "@/lib/serializers";
import { STATUSES, canonicalStatus } from "@/lib/api-v1/serialize";

const task = (id: number, status: Task["status"], targetDate = "2026-01-05"): Task => ({
  id,
  title: "t",
  projectId: 1,
  priority: "Medium",
  status,
  responsible: "Varad",
  assignees: [],
  targetDate,
  estimatedHours: 1,
  important: false,
});

describe("Hold status", () => {
  it("is paused: not closed, not active work, not evaluated", () => {
    expect(isOnHold("Hold")).toBe(true);
    expect(isClosed("Hold")).toBe(false);
    expect(isActiveWork("Hold")).toBe(false);
    expect(isEvaluated("Hold")).toBe(false);
    expect(isActiveWork("Blocked")).toBe(true);
    expect(isEvaluated("Blocked")).toBe(true);
    expect(isEvaluated("Done")).toBe(true);
  });

  it("is never overdue and never carried forward", () => {
    expect(overdueDaysFor(new Date("2020-01-01"), "Hold")).toBeUndefined();
    expect(isCarriedForward("Hold")).toBe(false);
    const old = task(1, "Hold", "2020-01-06");
    expect(taskInWeek(old, weekNumberOf("2020-01-06"))).toBe(true);
    expect(taskInWeek(old, weekNumberOf("2020-01-13"))).toBe(false);
    expect(taskInRange(old, "2020-02-01", "2020-02-29")).toBe(false);
    expect(taskInRange(old, "2020-01-01", "2020-01-31")).toBe(true);
    // An open task with the same date does carry into later windows.
    expect(taskInRange(task(2, "To Do", "2020-01-06"), "2020-02-01", "2020-02-29")).toBe(true);
  });

  it("doesn't stamp completedAt and isn't rework when resumed", () => {
    expect(completedAtUpdate("In Progress", "Hold")).toBeUndefined();
    expect(completedAtUpdate("Hold", "To Do")).toBeUndefined();
    expect(isReopen("Hold", "In Progress")).toBe(false);
  });

  it("is left out of project progress, like Cancelled", () => {
    expect(projectProgress(1, [task(1, "Done"), task(2, "To Do"), task(3, "Hold"), task(4, "Cancelled")])).toBe(50);
  });

  it("is an API status (any case)", () => {
    expect(STATUSES).toContain("Hold");
    expect(canonicalStatus("hold")).toBe("Hold");
  });
});
