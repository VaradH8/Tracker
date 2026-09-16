import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canAccessProject: vi.fn(),
  canManageProjectTasks: vi.fn(),
  canSeeTask: vi.fn(),
  completedAtUpdate: vi.fn(),
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
} from "@/lib/server-access";
import { PATCH } from "@/app/api/tasks/[id]/route";

/**
 * Who may change what on an existing task.
 *
 *  - The target date: anyone on the task (assignee) or any editor. The
 *    people doing the work know when it will actually land.
 *  - Estimated hours: Lead or Admin only. The estimate is a planning
 *    commitment and stays with whoever owns the plan — a Coordinator may
 *    edit everything else about the task, but not this.
 *
 * TaskDrawer's canEditDate / canEditHours mirror these exactly.
 */

function actor(role: SessionUser["role"], id = `u-${role}`): SessionUser {
  return { id, email: `${role}@x.com`, name: role, role, isAdmin: role === "Admin" };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
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
  status: "To Do",
  important: false,
  responsibleId: "u-lead",
  project: { name: "Atlas" },
};

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(canAccessProject).mockReset().mockResolvedValue(true);
  vi.mocked(canManageProjectTasks).mockReset();
  vi.mocked(isTaskAssignee).mockReset();
  vi.mocked(prisma.task.findUnique).mockReset().mockResolvedValue(existing as never);
  vi.mocked(prisma.task.update).mockReset().mockResolvedValue({ id: 5 } as never);
});

function as(role: SessionUser["role"], { editor, assignee }: { editor: boolean; assignee: boolean }) {
  vi.mocked(requireUser).mockResolvedValue(actor(role));
  vi.mocked(canManageProjectTasks).mockResolvedValue(editor);
  vi.mocked(isTaskAssignee).mockResolvedValue(assignee);
}

describe("PATCH /api/tasks/[id] — target date", () => {
  it("a developer on the task moves the date — 200", async () => {
    as("Developer", { editor: false, assignee: true });
    const res = await PATCH(req({ targetDate: "2026-10-01" }), params("5"));
    expect(res.status).toBe(200);
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { targetDate: new Date("2026-10-01") },
      }),
    );
  });

  it("a developer NOT on the task may not move the date — 403", async () => {
    as("Developer", { editor: false, assignee: false });
    const res = await PATCH(req({ targetDate: "2026-10-01" }), params("5"));
    expect(res.status).toBe(403);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("a Coordinator (editor) moves the date — 200", async () => {
    as("Coordinator", { editor: true, assignee: false });
    expect((await PATCH(req({ targetDate: "2026-10-01" }), params("5"))).status).toBe(200);
  });

  it("an assignee clears the date with null — 200", async () => {
    as("Developer", { editor: false, assignee: true });
    const res = await PATCH(req({ targetDate: null }), params("5"));
    expect(res.status).toBe(200);
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { targetDate: null } }),
    );
  });
});

describe("PATCH /api/tasks/[id] — estimated hours", () => {
  it("a Lead sets the estimate — 200", async () => {
    as("Lead", { editor: true, assignee: false });
    const res = await PATCH(req({ estimatedHours: 8 }), params("5"));
    expect(res.status).toBe(200);
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estimatedHours: 8 } }),
    );
  });

  it("an Admin sets the estimate — 200", async () => {
    as("Admin", { editor: true, assignee: false });
    expect((await PATCH(req({ estimatedHours: 8 }), params("5"))).status).toBe(200);
  });

  it("a Coordinator, though an editor, may NOT set the estimate — 403", async () => {
    as("Coordinator", { editor: true, assignee: false });
    const res = await PATCH(req({ estimatedHours: 8 }), params("5"));
    expect(res.status).toBe(403);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("a developer on the task may NOT set the estimate — 403", async () => {
    as("Developer", { editor: false, assignee: true });
    const res = await PATCH(req({ estimatedHours: 8 }), params("5"));
    expect(res.status).toBe(403);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it("a Coordinator still edits everything else (title) — 200", async () => {
    as("Coordinator", { editor: true, assignee: false });
    const res = await PATCH(req({ title: "Wire up the CSV export" }), params("5"));
    expect(res.status).toBe(200);
    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: "Wire up the CSV export" } }),
    );
  });
});
