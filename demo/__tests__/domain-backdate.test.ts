import { describe, it, expect } from "vitest";
import { backdateFloorISO, istParts } from "@/lib/domain";

/**
 * Work logs may now be dated, which relaxes a deliberate control: entries
 * used to be pinned to the day they were filed so hours could not be
 * invented afterwards. The month boundary is what keeps that meaningful —
 * you can catch up within the month you are in, but a month that has been
 * closed off and reported on stays closed.
 */
describe("work log back-dating floor", () => {
  const at = (iso: string) => new Date(iso + "T12:00:00.000Z");

  it("is the 1st of the current month", () => {
    expect(backdateFloorISO(at("2026-08-14"))).toBe("2026-08-01");
    expect(backdateFloorISO(at("2026-12-31"))).toBe("2026-12-01");
  });

  it("on the 1st, the floor is today — nothing earlier is reachable", () => {
    const now = at("2026-09-01");
    expect(backdateFloorISO(now)).toBe(istParts(now).dateISO);
  });

  it("resets at a month boundary rather than sliding", () => {
    // The last day of August still reaches back to 1 Aug; the next day
    // reaches only to 1 Sep. A fixed-day window would have let 1 Sep
    // reach into August.
    expect(backdateFloorISO(at("2026-08-31"))).toBe("2026-08-01");
    expect(backdateFloorISO(at("2026-09-01"))).toBe("2026-09-01");
  });

  it("works across a year boundary", () => {
    expect(backdateFloorISO(at("2026-01-15"))).toBe("2026-01-01");
  });

  it("handles February, including a leap year", () => {
    expect(backdateFloorISO(at("2028-02-29"))).toBe("2028-02-01");
  });

  it("uses the IST day, not the UTC one", () => {
    // 23:00 IST on 31 Aug is 17:30 UTC the same day — fine. But 01:00 IST
    // on 1 Sep is 19:30 UTC on 31 Aug: reading UTC would put the floor in
    // August and let someone log into a month that had just closed.
    expect(backdateFloorISO(new Date("2026-08-31T19:30:00.000Z"))).toBe(
      "2026-09-01",
    );
  });

  it("string comparison against the floor behaves, since ISO keys sort", () => {
    const floor = backdateFloorISO(at("2026-08-14"));
    expect("2026-07-31" < floor).toBe(true);
    expect("2026-08-01" < floor).toBe(false);
    expect("2026-08-14" < floor).toBe(false);
  });
});
