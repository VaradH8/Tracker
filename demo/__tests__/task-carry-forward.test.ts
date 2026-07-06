import { describe, it, expect } from "vitest";
import {
  isCarriedForward,
  taskInWeek,
  weekNumberOf,
  type Status,
  type Task,
} from "@/lib/mock";

// A task whose target date falls in ISO week 28 of 2026 (Mon 6 Jul 2026).
const TARGET = "2026-07-06";
const NATIVE = weekNumberOf(TARGET); // 28

function taskWith(status: Status): Task {
  return {
    id: 1,
    title: "Carry me",
    projectId: 1,
    priority: "Medium",
    status,
    responsible: "Varad",
    assignees: ["Sanjana"],
    targetDate: TARGET,
    estimatedHours: 8,
    important: false,
  };
}

describe("isCarriedForward", () => {
  it("carries only In Progress and In review", () => {
    expect(isCarriedForward("In Progress")).toBe(true);
    expect(isCarriedForward("In review")).toBe(true);
    expect(isCarriedForward("To Do")).toBe(false);
    expect(isCarriedForward("Blocked")).toBe(false);
    expect(isCarriedForward("Done")).toBe(false);
  });
});

describe("taskInWeek", () => {
  it("anchors NATIVE to the target date's own week", () => {
    expect(NATIVE).toBe(28);
    for (const s of ["To Do", "In Progress", "Blocked", "In review", "Done"] as Status[]) {
      expect(taskInWeek(taskWith(s), NATIVE)).toBe(true);
    }
  });

  it("carries an In Progress task into the next week and beyond", () => {
    const t = taskWith("In Progress");
    expect(taskInWeek(t, NATIVE + 1)).toBe(true); // Week 29
    expect(taskInWeek(t, NATIVE + 5)).toBe(true); // keeps rolling
  });

  it("carries an In review task forward too", () => {
    expect(taskInWeek(taskWith("In review"), NATIVE + 1)).toBe(true);
  });

  it("does NOT carry a Done task past its week — the carry ends at completion", () => {
    expect(taskInWeek(taskWith("Done"), NATIVE + 1)).toBe(false);
  });

  it("does NOT carry To Do or Blocked tasks forward", () => {
    expect(taskInWeek(taskWith("To Do"), NATIVE + 1)).toBe(false);
    expect(taskInWeek(taskWith("Blocked"), NATIVE + 1)).toBe(false);
  });

  it("never shows a task in a week before its target week", () => {
    expect(taskInWeek(taskWith("In Progress"), NATIVE - 1)).toBe(false);
    expect(taskInWeek(taskWith("Done"), NATIVE - 1)).toBe(false);
  });
});
