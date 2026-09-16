import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findUnique: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canManageProjectTasks: vi.fn(),
  canSeeTask: vi.fn(),
  canAccessProject: vi.fn(),
  notifyUser: vi.fn(),
  userByFirstName: vi.fn(),
  writeAudit: vi.fn(),
  completedAtUpdate: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

import { prisma } from "@/lib/db";
import { canManageProjectTasks, requireUser, writeAudit } from "@/lib/server-access";
import { DELETE } from "@/app/api/tasks/[id]/route";

/**
 * A developer may delete a task they created — and only those.
 *
 * Ownership is Task.responsibleId, the user who raised the task. Being
 * assigned to it is not ownership: work somebody else handed you is theirs
 * to withdraw.
 */

function actor(role: SessionUser["role"], id = `u-${role}`): SessionUser {
  return { id, email: `${role}@x.com`, name: role, role, isAdmin: role === "Admin" };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://t/api/tasks/5", { method: "DELETE" });

function task(responsibleId: string | null) {
  return {
    id: 5,
    title: "Wire up the export",
    projectId: 7,
    responsibleId,
    project: { name: "Atlas" },
  };
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(canManageProjectTasks).mockReset();
  vi.mocked(writeAudit).mockReset();
  vi.mocked(prisma.task.findUnique).mockReset();
  vi.mocked(prisma.task.delete).mockReset();
  vi.mocked(prisma.task.delete).mockResolvedValue({} as never);
});

describe("DELETE /api/tasks/[id] — who may delete", () => {
  it("401 when signed out", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await DELETE(req(), params("5"))).status).toBe(401);
    expect(prisma.task.delete).not.toHaveBeenCalled();
  });

  it("a developer deletes a task they raised — 200", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-dev"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(task("u-dev") as never);
    vi.mocked(canManageProjectTasks).mockResolvedValue(false);
    const res = await DELETE(req(), params("5"));
    expect(res.status).toBe(200);
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    // The manager check is never even consulted for the creator.
    expect(canManageProjectTasks).not.toHaveBeenCalled();
  });

  it("a developer may NOT delete a task somebody else raised — 403", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-dev"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(task("u-lead") as never);
    vi.mocked(canManageProjectTasks).mockResolvedValue(false);
    const res = await DELETE(req(), params("5"));
    expect(res.status).toBe(403);
    expect(prisma.task.delete).not.toHaveBeenCalled();
  });

  it("being assigned is not owning: an assignee who did not raise it — 403", async () => {
    // responsibleId is the raiser; assignment lives on TaskAssignee and
    // grants no delete right.
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-dev"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(task("u-coord") as never);
    vi.mocked(canManageProjectTasks).mockResolvedValue(false);
    expect((await DELETE(req(), params("5"))).status).toBe(403);
  });

  it("a task with no responsible owner is not deletable by a developer — 403", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-dev"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(task(null) as never);
    vi.mocked(canManageProjectTasks).mockResolvedValue(false);
    expect((await DELETE(req(), params("5"))).status).toBe(403);
  });

  it("a Coordinator still deletes any task on their project — 200", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(task("u-someone") as never);
    vi.mocked(canManageProjectTasks).mockResolvedValue(true);
    expect((await DELETE(req(), params("5"))).status).toBe(200);
  });

  it("404 when the task does not exist", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-dev"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(null);
    expect((await DELETE(req(), params("5"))).status).toBe(404);
    expect(prisma.task.delete).not.toHaveBeenCalled();
  });

  it("writes an audit entry naming the task", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-dev"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(task("u-dev") as never);
    await DELETE(req(), params("5"));
    expect(writeAudit).toHaveBeenCalledWith(
      "u-dev",
      "task.delete",
      expect.objectContaining({ scope: "Atlas", taskTitle: "Wire up the export" }),
    );
  });
});
