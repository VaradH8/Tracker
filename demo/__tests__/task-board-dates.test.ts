import { describe, it, expect } from "vitest";
import {
  currentWeek,
  finishedOn,
  isoWeekRange,
  taskInRange,
  todayISO,
  weekAnchorOf,
  type Task,
} from "@/lib/mock";

/** `days` from today as YYYY-MM-DD (string arithmetic on todayISO, so the
 *  test agrees with the helpers whatever the machine's timezone). */
function shift(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The helpers under test read only status and the two dates. */
function task(over: Partial<Task>): Task {
  return { status: "Done", completedAt: null, targetDate: null, ...over } as Task;
}

describe("finishedOn — a Done task never finishes in the future", () => {
  const today = todayISO();

  it("keeps a completedAt in the past", () => {
    const past = shift(today, -10);
    expect(finishedOn(task({ completedAt: past }))).toBe(past);
  });

  it("no completedAt and a deadline already passed → the deadline (legacy rows)", () => {
    const past = shift(today, -3);
    expect(finishedOn(task({ targetDate: past }))).toBe(past);
  });

  it("no completedAt and a deadline still ahead → today", () => {
    expect(finishedOn(task({ targetDate: shift(today, 12) }))).toBe(today);
  });

  it("a completedAt in the future (bad import) is capped at today", () => {
    expect(finishedOn(task({ completedAt: shift(today, 5) }))).toBe(today);
  });

  it("no dates at all → today, so the task still shows somewhere", () => {
    expect(finishedOn(task({}))).toBe(today);
  });
});

describe("weekly board placement of a Done task with its deadline still ahead", () => {
  const today = todayISO();
  const thisWeek = isoWeekRange(0);
  const nextWeek = { from: shift(thisWeek.from, 7), to: shift(thisWeek.to, 7) };
  // Created straight into Done (no completedAt) with a target next week.
  const done = task({ targetDate: shift(today, 7) });

  it("files under this week, not the week of its deadline", () => {
    expect(taskInRange(done, thisWeek.from, thisWeek.to)).toBe(true);
    expect(taskInRange(done, nextWeek.from, nextWeek.to)).toBe(false);
    expect(weekAnchorOf(done)).toBe(currentWeek());
  });

  it("an undated Done task is not lost from every window", () => {
    expect(taskInRange(task({}), thisWeek.from, thisWeek.to)).toBe(true);
  });

  it("an open task with the same deadline still waits for its own week", () => {
    const open = task({ status: "In Progress", targetDate: shift(today, 7) });
    expect(taskInRange(open, nextWeek.from, nextWeek.to)).toBe(true);
  });
});
