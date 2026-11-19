import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findUnique: vi.fn(), update: vi.fn() },
    taskHistory: { createMany: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canAccessProject: vi.fn(),
  canManageProjectTasks: vi.fn(),
  canSeeTask: vi.fn(),
  completedAtUpdate: vi.fn(),
  isReopen: vi.fn(),
  isTaskAssignee: vi.fn(),
  userByFirstName: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/serializers", () => ({
  serializeTask: (t: unknown) => t,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canManageProjectTasks,
  canSeeTask,
  isTaskAssignee,
  requireUser,
} from "@/lib/server-access";
import { PATCH } from "@/app/api/tasks/[id]/route";
import { GET as historyGET } from "@/app/api/tasks/[id]/history/route";

/**
 * Every status change made in the UI (board drag and drop, the status
 * picker, the drawer) goes through PATCH /api/tasks/{id} and leaves a
 * TaskHistory row: who, when, from what, to what. The drawer reads them
 * back through GET /api/tasks/{id}/history.
 */

const dev: SessionUser = { id: "u-dev", email: "d@x.com", name: "Dev One", role: "Developer", isAdmin: false };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (body: Record<string, unknown>) =>
  new Request("http://t/api/tasks/5", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const existing = {
  id: 5,
  title: "Instrument Index: UAT support (PHS)",
  projectId: 87,
  status: "To Do",
  priority: "Medium",
  important: false,
  targetDate: new Date("2027-01-07T00:00:00Z"),
  startDate: null,
  responsibleId: "u-pm",
  project: { name: "EniMAX" },
};

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue(dev as never);
  vi.mocked(canAccessProject).mockReset().mockResolvedValue(true);
  vi.mocked(canManageProjectTasks).mockReset().mockResolvedValue(false);
  vi.mocked(isTaskAssignee).mockReset().mockResolvedValue(true);
  vi.mocked(canSeeTask).mockReset().mockResolvedValue(true);
  vi.mocked(prisma.task.findUnique).mockReset().mockResolvedValue(existing as never);
  vi.mocked(prisma.task.update).mockReset().mockResolvedValue({ id: 5 } as never);
  vi.mocked(prisma.taskHistory.createMany).mockReset();
  vi.mocked(prisma.taskHistory.findMany).mockReset().mockResolvedValue([] as never);
});

describe("status changes are recorded", () => {
  it("an assignee moving a task writes one status row with old and new", async () => {
    const res = await PATCH(patch({ status: "In Progress" }), params("5"));
    expect(res.status).toBe(200);
    expect(prisma.taskHistory.createMany).toHaveBeenCalledWith({
      data: [
        {
          taskId: 5,
          field: "status",
          oldValue: '"To Do"',
          newValue: '"In Progress"',
          changedById: "u-dev",
        },
      ],
    });
  });

  it("a due date move is recorded as due_date, like /api/v1", async () => {
    await PATCH(patch({ targetDate: "2027-01-14" }), params("5"));
    const rows = vi.mocked(prisma.taskHistory.createMany).mock.calls[0][0]!.data as { field: string; oldValue: string; newValue: string }[];
    expect(rows).toEqual([
      expect.objectContaining({ field: "due_date", oldValue: '"2027-01-07"', newValue: '"2027-01-14"' }),
    ]);
  });

  it("setting the same status again records nothing", async () => {
    await PATCH(patch({ status: "To Do" }), params("5"));
    expect(prisma.taskHistory.createMany).not.toHaveBeenCalled();
  });

  it("an unknown status is refused and nothing changes", async () => {
    const res = await PATCH(patch({ status: "Parked" }), params("5"));
    expect(res.status).toBe(400);
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.taskHistory.createMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/tasks/{id}/history", () => {
  const row = {
    id: 5,
    projectId: 87,
    responsibleId: "u-pm",
    project: { id: 87, key: null },
    parent: { id: 4, title: "Instrument Index", status: "To Do" },
    sprint: null,
  };

  it("returns the key, parent and history, newest first, with names", async () => {
    vi.mocked(prisma.task.findUnique).mockResolvedValue(row as never);
    vi.mocked(prisma.taskHistory.findMany).mockResolvedValue([
      {
        id: 2, at: new Date("2026-11-20T05:00:00Z"), field: "status", oldValue: '"To Do"', newValue: '"In Progress"',
        changedBy: { name: "Dev One" }, onBehalfOfUserId: null, sourceNote: null,
      },
      {
        id: 1, at: new Date("2026-11-19T06:24:52Z"), field: "created", oldValue: "null", newValue: '"Instrument Index: UAT support (PHS)"',
        changedBy: { name: "PM Inventive" }, onBehalfOfUserId: null, sourceNote: "Created from the EniMAX plan",
      },
    ] as never);
    const res = await historyGET(new Request("http://t/api/tasks/5/history"), params("5"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBe("P87-5");
    expect(body.parent).toEqual({ id: 4, title: "Instrument Index", status: "To Do" });
    expect(body.sprint).toBeNull();
    expect(body.history.map((h: { field: string }) => h.field)).toEqual(["status", "created"]);
    expect(body.history[0]).toMatchObject({ old: "To Do", new: "In Progress" });
    expect(body.history[1].note).toBe("Created from the EniMAX plan");
    expect(vi.mocked(prisma.taskHistory.findMany).mock.calls[0][0]).toMatchObject({
      where: { taskId: 5 },
      orderBy: { at: "desc" },
    });
  });

  it("refuses someone who can't see the task", async () => {
    vi.mocked(prisma.task.findUnique).mockResolvedValue(row as never);
    vi.mocked(canSeeTask).mockResolvedValue(false);
    const res = await historyGET(new Request("http://t/api/tasks/5/history"), params("5"));
    expect(res.status).toBe(403);
    expect(prisma.taskHistory.findMany).not.toHaveBeenCalled();
  });
});
