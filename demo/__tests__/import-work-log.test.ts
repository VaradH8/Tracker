import { describe, it, expect } from "vitest";
import {
  countTasks,
  toGroupedRows,
  toTaskRows,
  type WorkLogGroup,
} from "@/lib/import/work-log";

/**
 * A work log is a record of work already done, so every row is Done and
 * every row has a completion date. The weekly board files a finished task
 * by completedAt, so a log without one lands nowhere.
 */

const group = (over: Partial<WorkLogGroup> = {}): WorkLogGroup => ({
  project: "Thermax ENIMAX",
  client: "Thermax ENIMAX",
  assignee: "Gaurav",
  remark: "Enimax instrumentation BOM",
  tasks: [{ title: "Rules engine", done: "2026-09-01" }],
  ...over,
});

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

describe("toTaskRows", () => {
  it("marks everything Done and dates it", () => {
    const [row] = toTaskRows(group());
    expect(row.status).toBe("Done");
    expect(iso(row.completedAt)).toBe("2026-09-01");
  });

  it("sets targetDate to the completion date, never leaving it to default", () => {
    // The committer falls back to new Date() for a missing target, which
    // would stamp today on work finished weeks ago.
    const [row] = toTaskRows(group());
    expect(iso(row.targetDate)).toBe("2026-09-01");
  });

  it("keeps a start date where one was recorded, and null where not", () => {
    const [withStart] = toTaskRows(
      group({ tasks: [{ title: "T", start: "2026-09-03", done: "2026-09-04" }] }),
    );
    expect(iso(withStart.startDate)).toBe("2026-09-03");
    const [without] = toTaskRows(group());
    expect(without.startDate).toBeNull();
  });

  it("a same-day task starts and finishes on the same date", () => {
    const [row] = toTaskRows(
      group({ tasks: [{ title: "T", start: "2026-09-01", done: "2026-09-01" }] }),
    );
    expect(iso(row.startDate)).toBe(iso(row.completedAt));
  });

  it("puts the person in both seats — they did it and they own the record", () => {
    const [row] = toTaskRows(group());
    expect(row.assigneeNames).toEqual(["Gaurav"]);
    expect(row.responsibleName).toBe("Gaurav");
  });

  it("carries the group's remark onto every task", () => {
    const rows = toTaskRows(
      group({ tasks: [{ title: "A", done: "2026-09-01" }, { title: "B", done: "2026-09-02" }] }),
    );
    expect(rows.every((r) => r.remark === "Enimax instrumentation BOM")).toBe(true);
  });

  it("an absent remark is empty, not the string 'undefined'", () => {
    const [row] = toTaskRows(group({ remark: undefined }));
    expect(row.remark).toBe("");
  });

  it("keeps a description when given and null when not", () => {
    const [withDesc] = toTaskRows(
      group({ tasks: [{ title: "T", done: "2026-09-01", description: "+3,807 lines." }] }),
    );
    expect(withDesc.description).toBe("+3,807 lines.");
    expect(toTaskRows(group())[0].description).toBeNull();
  });

  it("collapses whitespace in the title so dedup-by-title behaves", () => {
    const [row] = toTaskRows(
      group({ tasks: [{ title: "  Rules   engine  ", done: "2026-09-01" }] }),
    );
    expect(row.title).toBe("Rules engine");
  });

  it("defaults priority to Medium rather than inventing one", () => {
    const [row] = toTaskRows(group());
    expect(row.priority).toBe("Medium");
    expect(row.estimatedHours).toBeNull();
  });
});

describe("toTaskRows rejects what it cannot honestly record", () => {
  it("a title that is only whitespace", () => {
    expect(() => toTaskRows(group({ tasks: [{ title: "   ", done: "2026-09-01" }] }))).toThrow(
      /no title/,
    );
  });

  it("a date that is not ISO", () => {
    expect(() => toTaskRows(group({ tasks: [{ title: "T", done: "01-Sep-2026" }] }))).toThrow(
      /YYYY-MM-DD/,
    );
  });

  it("a date that looks ISO but is not real", () => {
    expect(() => toTaskRows(group({ tasks: [{ title: "T", done: "2026-13-45" }] }))).toThrow();
  });

  it("a start date after the completion date", () => {
    expect(() =>
      toTaskRows(group({ tasks: [{ title: "T", start: "2026-09-09", done: "2026-09-04" }] })),
    ).toThrow(/start .* is after done/);
  });
});

describe("the whole log", () => {
  const log = {
    groups: [
      group(),
      group({
        project: "Tracker",
        assignee: "Gaurav",
        tasks: [
          { title: "A", done: "2026-09-01" },
          { title: "B", done: "2026-09-02" },
        ],
      }),
    ],
  };

  it("counts every task across every group", () => {
    expect(countTasks(log)).toBe(3);
  });

  it("keeps each group's rows with the group they belong to", () => {
    const grouped = toGroupedRows(log);
    expect(grouped.map((g) => g.group.project)).toEqual(["Thermax ENIMAX", "Tracker"]);
    expect(grouped.map((g) => g.rows.length)).toEqual([1, 2]);
  });

  it("an empty log is zero, not a crash", () => {
    expect(countTasks({ groups: [] })).toBe(0);
    expect(toGroupedRows({ groups: [] })).toEqual([]);
  });
});
