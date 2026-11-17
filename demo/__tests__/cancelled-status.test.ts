import { describe, it, expect } from "vitest";
import { isCarriedForward, isClosed, projectProgress, type Task } from "@/lib/mock";
import { completedAtUpdate, isReopen } from "@/lib/server-access";
import { overdueDaysFor } from "@/lib/serializers";

const task = (id: number, status: Task["status"]): Task => ({
  id,
  title: "t",
  projectId: 1,
  priority: "Medium",
  status,
  responsible: "Varad",
  assignees: [],
  targetDate: "2026-01-05",
  estimatedHours: 1,
  important: false,
});

describe("Cancelled status", () => {
  it("is closed: not carried forward, never overdue", () => {
    expect(isClosed("Cancelled")).toBe(true);
    expect(isClosed("Done")).toBe(true);
    expect(isClosed("Blocked")).toBe(false);
    expect(isCarriedForward("Cancelled")).toBe(false);
    expect(overdueDaysFor(new Date("2020-01-01"), "Cancelled")).toBeUndefined();
  });

  it("stamps completedAt on close and clears it on reopen", () => {
    expect(completedAtUpdate("In Progress", "Cancelled")).toBeInstanceOf(Date);
    expect(completedAtUpdate("Cancelled", "To Do")).toBeNull();
    expect(completedAtUpdate("Done", "Cancelled")).toBeUndefined();
  });

  it("reopening a Cancelled task isn't counted as rework; Done → Cancelled isn't either", () => {
    expect(isReopen("Cancelled", "In Progress")).toBe(false);
    expect(isReopen("Done", "Cancelled")).toBe(false);
    expect(isReopen("Done", "In Progress")).toBe(true);
  });

  it("leaves project progress: 1 done of 2 live tasks = 50%", () => {
    expect(projectProgress(1, [task(1, "Done"), task(2, "To Do"), task(3, "Cancelled")])).toBe(50);
  });
});
