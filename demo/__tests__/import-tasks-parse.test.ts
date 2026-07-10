import { describe, it, expect, vi } from "vitest";

// tasks.ts imports userByFirstName (→ prisma) at module load; stub both so
// the pure parser functions can be imported without a DB.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/server-access", () => ({ userByFirstName: vi.fn() }));

import { parseTaskRows, normalizeCell } from "@/lib/import/tasks";

describe("normalizeCell", () => {
  it("renders a Date as local yyyy-mm-dd (not UTC — no off-by-one)", () => {
    // Constructed at local midnight; local getters must recover the same day
    // regardless of the machine timezone.
    expect(normalizeCell(new Date(2026, 5, 29))).toBe("2026-06-29");
    expect(normalizeCell(new Date(2026, 3, 30))).toBe("2026-04-30");
  });

  it("passes strings through and coerces numbers/empties", () => {
    expect(normalizeCell("High")).toBe("High");
    expect(normalizeCell(40)).toBe("40");
    expect(normalizeCell("")).toBe("");
    expect(normalizeCell(null)).toBe("");
    expect(normalizeCell(undefined)).toBe("");
  });

  it("ignores an invalid Date", () => {
    expect(normalizeCell(new Date("nonsense"))).not.toMatch(/NaN/);
  });
});

describe("parseTaskRows (Samanvay-shaped sheet)", () => {
  // Mirrors the real file AFTER the route's normalizeCell pass: a banner row,
  // the real header, then task rows with dates already yyyy-mm-dd.
  const rows: string[][] = [
    ["SAMANVAY  24 tasks", "", "", "", "", "", "", "", "", "", "", "", ""],
    [
      "Project / Customer", "Week No", "Task No / Ref", "Priority",
      "Task Description", "Assigned By", "Assigned To", "Efforts (Hrs)",
      "Start Date", "Target Date", "Status", "Approved By", "Remark",
    ],
    ["Lurgi", "27", "", "High", "Cybersecurity", "", "Ankit", "", "2026-06-29", "", "In Progress", "", "note A"],
    ["Lurgi", "22", "", "High", "Email Notification Integration", "", "Sanjana + Abhishek", "40", "2026-05-26", "2026-05-29", "Done", "", "note B"],
    ["Lurgi", "25", "", "High", "Nvidia Omniverse integration", "", "varad", "", "2026-06-15", "2026-06-26", "In Progress", "", "week25"],
    ["Lurgi", "22", "", "High", "Nvidia Omniverse integration", "", "Varad", "", "2026-05-26", "2026-06-19", "In Progress", "", "week22"],
  ];

  const res = parseTaskRows(rows);

  it("skips the banner and detects the real header row", () => {
    expect(res.headerFound).toBe(true);
    // 4 task-bearing rows read (banner + header excluded)
    expect(res.rawRowCount).toBe(4);
  });

  it("maps title, priority, status, effort and multi-name assignees", () => {
    const cyber = res.tasks.find((t) => t.title === "Cybersecurity")!;
    expect(cyber.priority).toBe("High");
    expect(cyber.status).toBe("In Progress");
    expect(cyber.assigneeNames).toEqual(["Ankit"]);

    const email = res.tasks.find(
      (t) => t.title === "Email Notification Integration",
    )!;
    expect(email.status).toBe("Done");
    expect(email.estimatedHours).toBe(40);
    expect(email.assigneeNames).toEqual(["Sanjana", "Abhishek"]);
  });

  it("parses dates correctly (the SheetJS DD/MM corruption regression)", () => {
    const cyber = res.tasks.find((t) => t.title === "Cybersecurity")!;
    expect(cyber.startDate?.toISOString().slice(0, 10)).toBe("2026-06-29");
    const email = res.tasks.find(
      (t) => t.title === "Email Notification Integration",
    )!;
    expect(email.targetDate?.toISOString().slice(0, 10)).toBe("2026-05-29");
  });

  it("collapses same-titled rows to one task (keeps the last)", () => {
    const nvidia = res.tasks.filter(
      (t) => t.title === "Nvidia Omniverse integration",
    );
    expect(nvidia).toHaveLength(1);
    // last row wins → the Week-22 remark
    expect(nvidia[0].remark).toBe("week22");
    expect(res.tasks).toHaveLength(3); // 4 rows − 1 duplicate
  });
});
