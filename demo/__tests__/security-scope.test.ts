import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

/**
 * E5 / E11: access that used to stop at "can reach the project" or "has an
 * editor role somewhere" now also checks the task or the project.
 */

vi.mock("@/lib/db", () => ({
  prisma: {
    projectMember: { findMany: vi.fn(), findFirst: vi.fn() },
    taskAssignee: { findUnique: vi.fn() },
    task: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
    timeEntry: { findUnique: vi.fn(), delete: vi.fn() },
    remark: { findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/server-names", () => ({ refreshShortNames: vi.fn() }));

import { prisma } from "@/lib/db";

function user(role: SessionUser["role"], id = "u1"): SessionUser {
  return { id, email: `${id}@x.com`, name: "Test", role, isAdmin: role === "Admin" };
}

const task = { id: 5, projectId: 7, responsibleId: null };

describe("canUseTaskFiles (E5)", () => {
  beforeEach(() => {
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([]);
    vi.mocked(prisma.projectMember.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.taskAssignee.findUnique).mockResolvedValue(null);
  });

  it("lets an Admin or Co-ordinator use any task's files", async () => {
    const { canUseTaskFiles } = await import("@/lib/server-access");
    expect(await canUseTaskFiles(user("Admin"), task)).toBe(true);
    expect(await canUseTaskFiles(user("Coordinator"), task)).toBe(true);
  });

  it("lets an assignee use the task's files", async () => {
    vi.mocked(prisma.taskAssignee.findUnique).mockResolvedValue({ taskId: 5, userId: "u1" } as never);
    const { canUseTaskFiles } = await import("@/lib/server-access");
    expect(await canUseTaskFiles(user("Developer"), task)).toBe(true);
  });

  it("lets anyone rostered on the project use them — the existing upload rule", async () => {
    vi.mocked(prisma.projectMember.findFirst).mockResolvedValue({ userId: "u1" } as never);
    const { canUseTaskFiles } = await import("@/lib/server-access");
    expect(await canUseTaskFiles(user("Developer"), task)).toBe(true);
  });

  it("refuses a Developer who only reaches the project through another task", async () => {
    vi.mocked(prisma.task.findFirst).mockResolvedValue(null as never); // no subtask of theirs
    const { canUseTaskFiles } = await import("@/lib/server-access");
    expect(await canUseTaskFiles(user("Developer"), task)).toBe(false);
  });
});

describe("deleting someone else's time entry or remark (E11)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function routes(projectAccess: boolean) {
    vi.doMock("@/lib/server-access", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/server-access")>()),
      requireUser: vi.fn().mockResolvedValue(user("Lead", "lead-1")),
      canAccessProject: vi.fn().mockResolvedValue(projectAccess),
    }));
    const te = await import("@/app/api/time-entries/[id]/route");
    const rm = await import("@/app/api/tasks/[id]/remarks/[remarkId]/route");
    return { te, rm };
  }

  const req = new Request("http://t", { method: "DELETE" });

  it("lets a Lead delete another person's time entry on a project they can access", async () => {
    vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
      id: 3, userId: "dev-1", taskId: 5, hours: 2,
      task: { id: 5, actualHours: 4, projectId: 7 },
    } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    const { te } = await routes(true);
    const res = await te.DELETE(req, { params: Promise.resolve({ id: "3" }) });
    expect(res.status).toBe(200);
  });

  it("403 for a Lead on a project they cannot access", async () => {
    vi.mocked(prisma.timeEntry.findUnique).mockResolvedValue({
      id: 3, userId: "dev-1", taskId: 5, hours: 2,
      task: { id: 5, actualHours: 4, projectId: 99 },
    } as never);
    vi.mocked(prisma.$transaction).mockClear();
    const { te } = await routes(false);
    const res = await te.DELETE(req, { params: Promise.resolve({ id: "3" }) });
    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("403 for a Lead deleting a remark on a project they cannot access", async () => {
    vi.mocked(prisma.remark.findUnique).mockResolvedValue({ id: 8, authorId: "dev-1", taskId: 5 } as never);
    vi.mocked(prisma.task.findUnique).mockResolvedValue({ projectId: 99 } as never);
    vi.mocked(prisma.remark.delete).mockClear();
    const { rm } = await routes(false);
    const res = await rm.DELETE(req, { params: Promise.resolve({ id: "5", remarkId: "8" }) });
    expect(res.status).toBe(403);
    expect(prisma.remark.delete).not.toHaveBeenCalled();
  });

  it("still lets the author delete their own remark", async () => {
    vi.mocked(prisma.remark.findUnique).mockResolvedValue({ id: 8, authorId: "lead-1", taskId: 5 } as never);
    vi.mocked(prisma.remark.delete).mockResolvedValue({} as never);
    const { rm } = await routes(false);
    const res = await rm.DELETE(req, { params: Promise.resolve({ id: "5", remarkId: "8" }) });
    expect(res.status).toBe(200);
  });
});
