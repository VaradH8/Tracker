import { describe, it, expect } from "vitest";
import {
  fmtDate,
  fmtWeekday,
  fmtStamp,
  fmtEditedStamp,
  submissionStatusCls,
} from "@/lib/domain-format";

/**
 * One formatter backs every date in the module. It replaced thirteen local
 * copies that disagreed about whether to print the year — a disagreement
 * that made a project running two years late read as landing early on the
 * KPI screen.
 *
 * The house format is DD/MM/YY, always complete, with 24-hour time where a
 * time is shown. Field order is written out by hand rather than left to
 * the locale: toLocaleDateString renders 22/08/26 for one viewer and
 * 8/22/26 for another, which makes "08/09/26" genuinely ambiguous.
 */
describe("date formatting", () => {
  const thisYear = new Date().getUTCFullYear();

  it("renders DD/MM/YY with zero padding", () => {
    expect(fmtDate("2026-08-22")).toBe("22/08/26");
    expect(fmtDate("2026-01-05")).toBe("05/01/26");
    expect(fmtDate("2028-12-31")).toBe("31/12/28");
  });

  it("always shows the year, including inside the current year", () => {
    const yy = String(thisYear % 100).padStart(2, "0");
    expect(fmtDate(`${thisYear}-08-14`)).toBe(`14/08/${yy}`);
  });

  it("a handover and a projection two years apart are never ambiguous", () => {
    // The exact case that shipped broken: 30 Nov this year vs 15 Sep two
    // years out. Without the year these read as if the later one is first.
    expect(fmtDate("2026-11-30")).toBe("30/11/26");
    expect(fmtDate("2028-09-15")).toBe("15/09/28");
  });

  it("puts the day first, so 08/09 is never read as September the 8th", () => {
    expect(fmtDate("2026-09-08")).toBe("08/09/26");
    expect(fmtDate("2026-08-09")).toBe("09/08/26");
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
    expect(fmtDate("2026-03-01")).toBe("01/03/26");
  });

  it("the weekday variant leads with the day name, then the same date", () => {
    expect(fmtWeekday("2026-08-22")).toMatch(/^[A-Za-z]{3} 22\/08\/26$/);
  });

  it("timestamps use a 24-hour clock", () => {
    // Built from local parts so the assertion holds in any timezone; what
    // matters is the shape and that afternoon reads as 13-23, not 1-11 PM.
    const evening = new Date(2026, 7, 22, 20, 5);
    expect(fmtStamp(evening.toISOString())).toBe("22/08/26 20:05");
    const morning = new Date(2026, 7, 22, 8, 30);
    expect(fmtStamp(morning.toISOString())).toBe("22/08/26 08:30");
    // Never an AM/PM marker.
    expect(fmtStamp(evening.toISOString())).not.toMatch(/[AP]M/i);
  });

  it("midnight renders as 00:00, not 24:00 or 12:00", () => {
    const midnight = new Date(2026, 7, 22, 0, 0);
    expect(fmtStamp(midnight.toISOString())).toBe("22/08/26 00:00");
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

describe("the edited-on chip", () => {
  /**
   * A deliberately different shape from fmtStamp: DD-MM-YY and a 12-hour
   * clock, because this one is read as a sentence — "edited 27-08-26 at
   * 1.00 PM" — rather than scanned in a column.
   */
  it("renders as DD-MM-YY at H.MM AM/PM", () => {
    expect(fmtEditedStamp(new Date(2026, 7, 27, 13, 0).toISOString())).toBe(
      "27-08-26 at 1.00 PM",
    );
  });

  it("pads the date but not the hour", () => {
    // 09-03, not 9-3; but 9.05, not 09.05 — that is how a clock is read
    // aloud, and the chip is prose.
    expect(fmtEditedStamp(new Date(2026, 2, 9, 9, 5).toISOString())).toBe(
      "09-03-26 at 9.05 AM",
    );
  });

  it("gets the two hours everybody gets wrong", () => {
    // Midnight is 12 AM and noon is 12 PM. A naive h % 12 gives 0.
    expect(fmtEditedStamp(new Date(2026, 7, 27, 0, 5).toISOString())).toBe(
      "27-08-26 at 12.05 AM",
    );
    expect(fmtEditedStamp(new Date(2026, 7, 27, 12, 0).toISOString())).toBe(
      "27-08-26 at 12.00 PM",
    );
  });

  it("says nothing when there is nothing to say", () => {
    // A task nobody has edited must render no chip at all, so this has to
    // come back empty rather than "Invalid Date" or "NaN".
    expect(fmtEditedStamp(null)).toBe("");
    expect(fmtEditedStamp(undefined)).toBe("");
    expect(fmtEditedStamp("not a date")).toBe("");
  });
});
