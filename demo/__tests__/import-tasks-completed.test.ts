import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/server-access", () => ({ userByFirstName: vi.fn() }));

import { commitTaskRows, parseTaskRows, type ParsedTaskRow } from "@/lib/import/tasks";
import { userByFirstName } from "@/lib/server-access";

/**
 * When a finished task actually finished.
 *
 * The importer set status but never completedAt, and the weekly board
 * anchors a Done task by completedAt — so every imported task went missing
 * from the week it was finished in. A "Done Date" column records it, kept
 * separate from the target date because a task delivered late has two
 * different dates and storing one loses the other.
 */

const HEADER = [
  "Task Description",
  "Status",
  "Start Date",
  "Target Date",
  "Done Date",
  "Assigned To",
];

describe("parsing a Done Date", () => {
  it("reads it into completedAt, independent of the target date", () => {
    const { tasks } = parseTaskRows([
      HEADER,
      ["Ship the thing", "Done", "2026-09-01", "2026-09-04", "2026-09-09", "Sanjana"],
    ]);
    expect(tasks[0].targetDate!.toISOString().slice(0, 10)).toBe("2026-09-04");
    // Delivered five days late — both dates survive.
    expect(tasks[0].completedAt!.toISOString().slice(0, 10)).toBe("2026-09-09");
  });

  it.each(["Done Date", "Done On", "Completed", "Completed On", "Completion Date"])(
    "accepts the header spelled %s",
    (label) => {
      const { tasks } = parseTaskRows([
        ["Task Description", "Status", label],
        ["A", "Done", "2026-09-04"],
      ]);
      expect(tasks[0].completedAt!.toISOString().slice(0, 10)).toBe("2026-09-04");
    },
  );

  it("is null when the sheet has no such column", () => {
    const { tasks } = parseTaskRows([
      ["Task Description", "Status", "Target Date"],
      ["A", "Done", "2026-09-04"],
    ]);
    expect(tasks[0].completedAt).toBeNull();
  });

  it("is null for an unparseable or TBD value rather than a bad date", () => {
    const { tasks } = parseTaskRows([
      ["Task Description", "Status", "Done Date"],
      ["A", "Done", "TBD"],
      ["B", "Done", "whenever"],
    ]);
    expect(tasks.every((t) => t.completedAt === null)).toBe(true);
  });

  it("does not swallow the target date column", () => {
    const { tasks } = parseTaskRows([
      ["Task Description", "Target Date", "Done Date"],
      ["A", "2026-09-04", "2026-09-09"],
    ]);
    expect(tasks[0].targetDate).not.toBeNull();
    expect(tasks[0].completedAt).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */

function row(over: Partial<ParsedTaskRow> = {}): ParsedTaskRow {
  return {
    title: "Ship the thing",
    description: null,
    priority: "Medium",
    status: "Done",
    startDate: null,
    targetDate: new Date(Date.UTC(2026, 8, 4)),
    completedAt: new Date(Date.UTC(2026, 8, 9)),
    estimatedHours: null,
    assigneeNames: [],
    responsibleName: null,
    remark: "",
    ...over,
  };
}

function fakePrisma(existing: { id: number } | null) {
  return {
    task: {
      findFirst: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({ id: 7 }),
      update: vi.fn().mockResolvedValue({ id: existing?.id ?? 7 }),
    },
    taskAssignee: { create: vi.fn().mockResolvedValue({}) },
    remark: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

/** The completedAt actually handed to Prisma. */
async function written(
  task: ParsedTaskRow,
  existing: { id: number } | null = null,
) {
  const prisma = fakePrisma(existing);
  await commitTaskRows(prisma as never, 1, [task], {
    dryRun: false,
    actorId: "u-importer",
  });
  const call = existing
    ? prisma.task.update.mock.calls[0][0]
    : prisma.task.create.mock.calls[0][0];
  return { data: (call as { data: Record<string, unknown> }).data, prisma };
}

describe("committing completedAt", () => {
  beforeEach(() => {
    vi.mocked(userByFirstName).mockReset();
    vi.mocked(userByFirstName).mockResolvedValue(null as never);
  });

  it("stamps the Done Date on a newly created task", async () => {
    const { data } = await written(row());
    expect((data.completedAt as Date).toISOString().slice(0, 10)).toBe("2026-09-09");
  });

  it("stamps it on an existing task too, so a re-import corrects it", async () => {
    const { data } = await written(row(), { id: 42 });
    expect((data.completedAt as Date).toISOString().slice(0, 10)).toBe("2026-09-09");
  });

  it("falls back to the target date when the sheet gives no Done Date", async () => {
    // Deliberately NOT new Date(): filing historic work in the current week
    // is worse than filing it on its deadline.
    const { data } = await written(row({ completedAt: null }));
    expect((data.completedAt as Date).toISOString().slice(0, 10)).toBe("2026-09-04");
  });

  it.each(["To Do", "In Progress", "Blocked", "In review"])(
    "is null for a task that is %s, even with a date in the column",
    async (status) => {
      const { data } = await written(row({ status }));
      expect(data.completedAt).toBeNull();
    },
  );

  it("clears it when an existing task comes back from Done", async () => {
    const { data } = await written(row({ status: "In Progress" }), { id: 42 });
    expect(data.completedAt).toBeNull();
  });

  it("writes nothing at all on a dry run", async () => {
    const prisma = fakePrisma(null);
    const { stats } = await commitTaskRows(prisma as never, 1, [row()], {
      dryRun: true,
      actorId: "u-importer",
    });
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(stats.tasksCreated).toBe(1);
  });
});
