import { describe, it, expect } from "vitest";
import {
  fmtDate,
  fmtWeekday,
  fmtStamp,
  submissionStatusCls,
} from "@/lib/domain-format";

/**
 * One formatter now backs every date in the module. It replaced thirteen
 * local copies that disagreed about whether to print the year — a
 * disagreement that made a project running two years late read as landing
 * early on the KPI screen.
 */
describe("date formatting", () => {
  const thisYear = new Date().getUTCFullYear();

  it("omits the year for dates in the current year", () => {
    const out = fmtDate(`${thisYear}-08-14`);
    expect(out).not.toContain(String(thisYear));
    expect(out).toMatch(/14/);
  });

  it("prints the year for any other year — the whole point", () => {
    expect(fmtDate(`${thisYear + 2}-09-15`)).toContain(String(thisYear + 2));
    expect(fmtDate(`${thisYear - 1}-01-05`)).toContain(String(thisYear - 1));
  });

  it("a handover and a projection two years apart are never ambiguous", () => {
    // The exact case that shipped broken: 30 Nov this year vs 15 Sep two
    // years out. Without the year these read as if the later one is first.
    const handover = fmtDate(`${thisYear}-11-30`);
    const projected = fmtDate(`${thisYear + 2}-09-15`);
    expect(projected).toContain(String(thisYear + 2));
    expect(handover).not.toEqual(projected);
  });

  it("renders a dash for missing or unparseable input rather than 'Invalid Date'", () => {
    for (const bad of [null, undefined, "", "not-a-date"]) {
      expect(fmtDate(bad)).toBe("—");
      expect(fmtWeekday(bad)).toBe("—");
      expect(fmtStamp(bad)).toBe("—");
    }
  });

  it("treats day keys as UTC, so a date never slips to the previous day", () => {
    // Stored as UTC midnight; a local-time parse would render the 1st as
    // the 31st for anyone behind UTC.
    expect(fmtDate(`${thisYear}-03-01`)).toMatch(/\b1\b/);
  });

  it("the weekday variant leads with the day name", () => {
    expect(fmtWeekday(`${thisYear}-08-14`)).toMatch(/^[A-Za-z]{3}/);
  });
});

describe("submission status colours", () => {
  it("maps each decision to its own tone", () => {
    expect(submissionStatusCls("Approved")).toContain("green");
    expect(submissionStatusCls("Rejected")).toContain("red");
    // Pending, and anything unrecognised, stays neutral-amber rather than
    // falling through to a colour that implies a decision.
    expect(submissionStatusCls("Pending")).toContain("yellow");
    expect(submissionStatusCls("Whatever")).toContain("yellow");
  });
});
