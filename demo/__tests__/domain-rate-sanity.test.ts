import { describe, it, expect } from "vitest";
import {
  MAX_TAGS_PER_DAY,
  clampRate,
  effectiveRate,
  personalRate,
  rateIssue,
  rateWasClamped,
  splitRate,
} from "@/lib/forecast";

/**
 * The portfolio line read "107014.17/day across 25 people".
 *
 * Two independent causes, both covered here:
 *
 *   1. Nothing bounded a rate. "Avg tags/day" sits next to a project
 *      counted in thousands, so a project total typed into it was stored
 *      and planned with as a daily rate.
 *   2. A person's rate was counted once per project they appeared on,
 *      because the divisor that shares it out counted only their
 *      bookings while the resource list also counted tags held. Someone
 *      holding tags on six projects with no booking was "1 project" six
 *      times, and the portfolio figure adds the projects up.
 */

describe("a rate has a ceiling", () => {
  it("refuses a project total typed into a daily rate", () => {
    expect(rateIssue(10828)).toMatch(/project total/i);
    expect(rateIssue(4280)).toBeTruthy();
  });

  it("accepts every rate anybody actually works at", () => {
    for (const r of [1, 8, 16.5, 38, 40, 150, 500, MAX_TAGS_PER_DAY]) {
      expect(rateIssue(r)).toBeNull();
    }
  });

  it("still refuses zero, negatives and nonsense", () => {
    expect(rateIssue(0)).toBeTruthy();
    expect(rateIssue(-5)).toBeTruthy();
    expect(rateIssue("abc")).toBeTruthy();
    expect(rateIssue(null)).toBeTruthy();
  });

  it("plans at the ceiling when a bad figure is already stored", () => {
    // Validation stops new ones; this stops the ones already in the
    // database from wrecking a projection in the meantime.
    expect(effectiveRate(10828)).toBe(MAX_TAGS_PER_DAY);
    expect(rateWasClamped(10828)).toBe(true);
  });

  it("leaves an ordinary rate exactly alone", () => {
    expect(effectiveRate(38)).toBe(38);
    expect(rateWasClamped(38)).toBe(false);
    expect(clampRate(38)).toBe(38);
  });

  it("still treats an unset rate as no capacity, not a default", () => {
    expect(effectiveRate(null)).toBe(0);
    expect(effectiveRate(undefined)).toBe(0);
    expect(effectiveRate(0)).toBe(0);
    expect(rateWasClamped(null)).toBe(false);
  });

  it("reports a measured rate honestly, ceiling or not", () => {
    // 9,000 tags approved against a single date is a backfill, not a
    // day's work. The availability screen must still say 9000 — that
    // figure is the evidence something was backdated. Only the plan is
    // capped, via effectiveRate.
    expect(personalRate(9000, 1)).toBe(9000);
    expect(effectiveRate(personalRate(9000, 1))).toBe(MAX_TAGS_PER_DAY);
  });
});

describe("sharing a person between projects", () => {
  it("adds back up to one person, however many projects they are on", () => {
    // This is the property the portfolio figure depends on: it sums the
    // projects, so the shares have to reconstitute the person. Each share
    // is rounded to two decimals, so seven ways gives back 59.99 rather
    // than 60 — a cent of rounding, not a person appearing twice.
    for (const n of [1, 2, 3, 6, 7]) {
      const share = splitRate(60, n);
      expect(share * n).toBeCloseTo(60, 1);
    }
  });

  it("does not multiply a rate when the count is wrong-way-round", () => {
    expect(splitRate(60, 0)).toBe(60);
    expect(splitRate(60, 1)).toBe(60);
  });

  it("shows what the old divisor did to the portfolio total", () => {
    // Six projects, one person, no bookings anywhere. The divisor used to
    // see zero overlapping bookings and return 1, so the project rate was
    // their whole 60 on each of the six.
    const projects = 6;
    const wasCountedAs = 1;
    const before = projects * splitRate(60, wasCountedAs);
    const after = projects * splitRate(60, projects);
    expect(before).toBe(360);
    expect(after).toBe(60);
  });
});
