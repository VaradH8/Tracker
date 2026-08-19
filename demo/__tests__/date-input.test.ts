import { describe, it, expect } from "vitest";
import { isoToDisplay, displayToIso, maskDate } from "@/lib/date-field-format";

/**
 * DD-MM-YY in, ISO out.
 *
 * The parsing is the risky half: a date field that silently accepts
 * 31-02-26 puts a real-looking date into a contract, and one that rejects
 * a valid date blocks work. Both directions are pinned here.
 */

describe("isoToDisplay", () => {
  it("shows DD-MM-YY", () => {
    expect(isoToDisplay("2026-08-18")).toBe("18-08-26");
    expect(isoToDisplay("2027-02-28")).toBe("28-02-27");
  });

  it("shows nothing for an empty or malformed value", () => {
    expect(isoToDisplay("")).toBe("");
    expect(isoToDisplay("18/08/2026")).toBe("");
    expect(isoToDisplay("not a date")).toBe("");
  });
});

describe("displayToIso", () => {
  it("reads a complete DD-MM-YY", () => {
    expect(displayToIso("18-08-26")).toBe("2026-08-18");
    expect(displayToIso("01-01-30")).toBe("2030-01-01");
  });

  it("refuses a day that does not exist", () => {
    // Date would roll 31 Feb forward into March; the round-trip check
    // catches it instead of storing a date nobody typed.
    expect(displayToIso("31-02-26")).toBeNull();
    expect(displayToIso("31-04-26")).toBeNull();
    expect(displayToIso("00-08-26")).toBeNull();
    expect(displayToIso("18-13-26")).toBeNull();
  });

  it("accepts a real leap day and refuses a fake one", () => {
    expect(displayToIso("29-02-28")).toBe("2028-02-29");
    expect(displayToIso("29-02-27")).toBeNull();
  });

  it("refuses anything incomplete", () => {
    expect(displayToIso("")).toBeNull();
    expect(displayToIso("18")).toBeNull();
    expect(displayToIso("18-08")).toBeNull();
    expect(displayToIso("18-08-2026")).toBeNull();
  });

  it("round-trips every date it accepts", () => {
    for (const iso of ["2026-01-31", "2026-08-18", "2028-02-29", "2030-12-01"]) {
      expect(displayToIso(isoToDisplay(iso))).toBe(iso);
    }
  });
});

describe("maskDate", () => {
  it("groups digits as they are typed", () => {
    expect(maskDate("1")).toBe("1");
    expect(maskDate("18")).toBe("18");
    expect(maskDate("180")).toBe("18-0");
    expect(maskDate("1808")).toBe("18-08");
    expect(maskDate("180826")).toBe("18-08-26");
  });

  it("ignores anything that is not a digit, whatever the separator", () => {
    expect(maskDate("18/08/26")).toBe("18-08-26");
    expect(maskDate("18.08.26")).toBe("18-08-26");
    expect(maskDate("abc18def08gh26")).toBe("18-08-26");
  });

  it("stops at six digits", () => {
    expect(maskDate("1808261234")).toBe("18-08-26");
  });

  it("lets a field be cleared", () => {
    expect(maskDate("")).toBe("");
  });
});
