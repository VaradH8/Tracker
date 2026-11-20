import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    project: { findUnique: vi.fn() },
    taskHistory: { createMany: vi.fn() },
    $transaction: vi.fn(),
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
  isTaskAssignee,
  requireUser,
  writeAudit,
} from "@/lib/server-access";
import { PATCH } from "@/app/api/tasks/[id]/route";

/**
 * Changing an existing task's priority and moving it to another project —
 * both from the task drawer, the same way status is changed.
 *
 *  - Priority: an editor of the task's project, and only one of the four
 *    real values.
 *  - Project: an editor of BOTH projects. Subtasks move with their parent
 *    (a subtask can't move alone), and everything leaves the old project's
 *    sprint.
 */

function actor(role: SessionUser["role"], id = `u-${role}`): SessionUser {
  return { id, email: `${role}@x.com`, name: role, role, isAdmin: role === "Admin" };
}

const params = { params: Promise.resolve({ id: "5" }) };
const req = (body: Record<string, unknown>) =>
  new Request("http://t/api/tasks/5", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const existing = {
  id: 5,
  title: "Wire up the export",
  projectId: 7,
  status: "In Progress",
  priority: "Medium",
  important: false,
  responsibleId: "u-lead",
  parentId: null as number | null,
  sprintId: 3 as number | null,
  project: { name: "Atlas" },
};

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue(actor("Lead") as never);
  vi.mocked(canAccessProject).mockReset().mockResolvedValue(true);
  vi.mocked(canManageProjectTasks).mockReset().mockResolvedValue(true);
  vi.mocked(isTaskAssignee).mockReset().mockResolvedValue(false);
  vi.mocked(writeAudit).mockReset();
  vi.mocked(prisma.task.findUnique).mockReset().mockResolvedValue(existing as never);
  vi.mocked(prisma.task.update).mockReset().mockResolvedValue({ id: 5 } as never);
  vi.mocked(prisma.task.updateMany).mockReset().mockResolvedValue({ count: 2 } as never);
  vi.mocked(prisma.project.findUnique).mockReset().mockResolvedValue({ id: 9, name: "Borealis" } as never);
  vi.mocked(prisma.$transaction).mockReset().mockImplementation(async (ops: unknown) =>
    Promise.all(ops as Promise<unknown>[]),
  );
});

const updateData = () =>
  (vi.mocked(prisma.task.update).mock.calls[0][0] as { data: Record<string, unknown> }).data;

describe("changing priority", () => {
  it("an editor can set a valid priority", async () => {
    const res = await PATCH(req({ priority: "Critical" }), params);
    expect(res.status).toBe(200);
    expect(updateData().priority).toBe("Critical");
  });

  it("refuses a priority that isn't one of the four", async () => {
    const res = await PATCH(req({ priority: "Urgent!!" }), params);
    expect(res.status).toBe(400);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("an assignee who isn't an editor can't change it", async () => {
    vi.mocked(canManageProjectTasks).mockResolvedValue(false);
    vi.mocked(isTaskAssignee).mockResolvedValue(true);
    vi.mocked(requireUser).mockResolvedValue(actor("Developer") as never);
    const res = await PATCH(req({ priority: "High" }), params);
    // Nothing the developer may change was sent.
    expect(res.status).toBe(400);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});

describe("moving a task to another project", () => {
  it("moves the task, its subtasks, and takes them out of the old sprint", async () => {
    const res = await PATCH(req({ projectId: 9 }), params);
    expect(res.status).toBe(200);
    expect(updateData()).toMatchObject({ projectId: 9, sprintId: null });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { parentId: 5 },
      data: { projectId: 9, sprintId: null },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(
      "u-Lead",
      "task.move_project",
      expect.objectContaining({ before: "Atlas", after: "Borealis" }),
    );
  });

  it("refuses someone who doesn't run the task's current project", async () => {
    vi.mocked(canManageProjectTasks).mockImplementation(async (_u, pid) => pid !== 7);
    const res = await PATCH(req({ projectId: 9 }), params);
    expect(res.status).toBe(403);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("refuses a destination project they can't manage", async () => {
    vi.mocked(canManageProjectTasks).mockImplementation(async (_u, pid) => pid === 7);
    const res = await PATCH(req({ projectId: 9 }), params);
    expect(res.status).toBe(403);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("refuses a destination project they can't even see", async () => {
    vi.mocked(canAccessProject).mockImplementation(async (_u, pid) => pid === 7);
    const res = await PATCH(req({ projectId: 9 }), params);
    expect(res.status).toBe(403);
  });

  it("404s on a project that doesn't exist", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
    const res = await PATCH(req({ projectId: 999 }), params);
    expect(res.status).toBe(404);
  });

  it("won't move a subtask on its own", async () => {
    vi.mocked(prisma.task.findUnique).mockResolvedValue({ ...existing, parentId: 1 } as never);
    const res = await PATCH(req({ projectId: 9 }), params);
    expect(res.status).toBe(400);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("sending the current project changes nothing and uses no transaction", async () => {
    const res = await PATCH(req({ projectId: 7, priority: "High" }), params);
    expect(res.status).toBe(200);
    expect(updateData()).not.toHaveProperty("projectId");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });
});
