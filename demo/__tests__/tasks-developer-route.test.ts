import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  visibleProjectIds: vi.fn(),
  rosteredProjectIds: vi.fn(),
  canCreateProjectTasks: vi.fn(),
  assigneesOutsideProject: vi.fn(),
  userByFirstName: vi.fn(),
  notifyUser: vi.fn(),
  writeAudit: vi.fn(),
  canSeeAllProjectTasks: (r: string) =>
    r === "Admin" || r === "Lead" || r === "Coordinator",
  taskAssignmentFilter: (userId: string) => ({
    OR: [{ assignees: { some: { userId } } }, { responsibleId: userId }],
  }),
  forkableTasksFilter: (userId: string) => ({
    NOT: {
      OR: [{ assignees: { some: { userId } } }, { responsibleId: userId }],
    },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

import { prisma } from "@/lib/db";
import {
  assigneesOutsideProject,
  canCreateProjectTasks,
  requireUser,
  rosteredProjectIds,
  userByFirstName,
  visibleProjectIds,
} from "@/lib/server-access";
import { GET as tasksGET, POST as tasksPOST } from "@/app/api/tasks/route";

function actor(role: SessionUser["role"], id = `u-${role}`): SessionUser {
  return { id, email: `${role}@x.com`, name: role, role, isAdmin: role === "Admin" };
}

function postReq(body: Record<string, unknown>) {
  return new Request("http://t/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createdTask() {
  return {
    id: 1,
    title: "New work",
    description: null,
    projectId: 7,
    priority: "Medium",
    status: "To Do",
    startDate: null,
    targetDate: new Date("2026-09-01"),
    estimatedHours: null,
    actualHours: null,
    important: false,
    overdueDays: null,
    completedAt: null,
    responsibleId: "u-Developer",
    responsible: { name: "Dev Person" },
    approvedById: null,
    approvedBy: null,
    approvedAt: null,
    forkedFromId: null,
    forkedAt: null,
    assignees: [],
    remarks: [],
    attachments: [],
    blockedBy: [],
    project: { name: "Atlas" },
  };
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(visibleProjectIds).mockReset();
  vi.mocked(rosteredProjectIds).mockReset();
  vi.mocked(canCreateProjectTasks).mockReset();
  vi.mocked(assigneesOutsideProject).mockReset();
  vi.mocked(userByFirstName).mockReset();
  vi.mocked(prisma.task.findMany).mockReset();
  vi.mocked(prisma.task.create).mockReset();
});

describe("POST /api/tasks — a Developer raising work", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    vi.mocked(prisma.task.create).mockResolvedValue(createdTask() as never);
  });

  it("403 when they are not rostered on the project", async () => {
    vi.mocked(canCreateProjectTasks).mockResolvedValue(false);
    const res = await tasksPOST(postReq({ title: "New work", projectId: 7 }));
    expect(res.status).toBe(403);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("201 self-assigning on a project they are rostered on", async () => {
    vi.mocked(canCreateProjectTasks).mockResolvedValue(true);
    vi.mocked(userByFirstName).mockResolvedValue({
      id: "u-Developer",
      name: "Dev Person",
    } as never);
    vi.mocked(assigneesOutsideProject).mockResolvedValue([]);
    const res = await tasksPOST(
      postReq({ title: "New work", projectId: 7, assignees: ["Dev"] }),
    );
    expect(res.status).toBe(201);
    const data = vi.mocked(prisma.task.create).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.assignees).toEqual({ create: [{ userId: "u-Developer" }] });
  });

  it("201 assigning a teammate who is on the same project", async () => {
    vi.mocked(canCreateProjectTasks).mockResolvedValue(true);
    vi.mocked(userByFirstName).mockResolvedValue({
      id: "u-teammate",
      name: "Team Mate",
    } as never);
    vi.mocked(assigneesOutsideProject).mockResolvedValue([]);
    const res = await tasksPOST(
      postReq({ title: "New work", projectId: 7, assignees: ["Team"] }),
    );
    expect(res.status).toBe(201);
    const data = vi.mocked(prisma.task.create).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.assignees).toEqual({ create: [{ userId: "u-teammate" }] });
  });

  it("403 assigning somebody who is not on the project", async () => {
    vi.mocked(canCreateProjectTasks).mockResolvedValue(true);
    vi.mocked(userByFirstName).mockResolvedValue({
      id: "u-stranger",
      name: "Out Sider",
    } as never);
    vi.mocked(assigneesOutsideProject).mockResolvedValue(["u-stranger"]);
    const res = await tasksPOST(
      postReq({ title: "New work", projectId: 7, assignees: ["Out"] }),
    );
    expect(res.status).toBe(403);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("is always the responsible owner — cannot pin it on someone else", async () => {
    vi.mocked(canCreateProjectTasks).mockResolvedValue(true);
    vi.mocked(assigneesOutsideProject).mockResolvedValue([]);
    await tasksPOST(
      postReq({ title: "New work", projectId: 7, responsible: "Lead" }),
    );
    const data = vi.mocked(prisma.task.create).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.responsibleId).toBe("u-Developer");
    // The lookup is skipped entirely for a Developer.
    expect(userByFirstName).not.toHaveBeenCalledWith("Lead");
  });
});

describe("POST /api/tasks — oversight roles are unchanged", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
    vi.mocked(canCreateProjectTasks).mockResolvedValue(true);
    vi.mocked(prisma.task.create).mockResolvedValue(createdTask() as never);
  });

  it("a Coordinator may still name a different responsible owner", async () => {
    vi.mocked(userByFirstName).mockResolvedValue({
      id: "u-Lead",
      name: "Lead Person",
    } as never);
    await tasksPOST(
      postReq({ title: "New work", projectId: 7, responsible: "Lead" }),
    );
    const data = vi.mocked(prisma.task.create).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.responsibleId).toBe("u-Lead");
  });

  it("a Coordinator's assignees are not confined to the project roster", async () => {
    vi.mocked(userByFirstName).mockResolvedValue({
      id: "u-anyone",
      name: "Any One",
    } as never);
    await tasksPOST(
      postReq({ title: "New work", projectId: 7, assignees: ["Any"] }),
    );
    expect(assigneesOutsideProject).not.toHaveBeenCalled();
  });
});

describe("GET /api/tasks?forkable=true — the read-only forkable feed", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
  });

  it("excludes the caller's own work and stays inside their projects", async () => {
    vi.mocked(visibleProjectIds).mockResolvedValue([7, 8]);
    vi.mocked(rosteredProjectIds).mockResolvedValue([7, 8]);
    await tasksGET(new Request("http://t/api/tasks?forkable=true"));
    const where = vi.mocked(prisma.task.findMany).mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.projectId).toEqual({ in: [7, 8] });
    expect(where.NOT).toEqual({
      OR: [
        { assignees: { some: { userId: "u-Developer" } } },
        { responsibleId: "u-Developer" },
      ],
    });
  });

  it("narrows to rostered projects, not merely visible ones — no Fork button the endpoint would refuse", async () => {
    // Project 8 is visible only because they hold a task on it; they are
    // not on its roster, so fork would 403 there. It must not appear.
    vi.mocked(visibleProjectIds).mockResolvedValue([7, 8]);
    vi.mocked(rosteredProjectIds).mockResolvedValue([7]);
    await tasksGET(new Request("http://t/api/tasks?forkable=true"));
    const where = vi.mocked(prisma.task.findMany).mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.projectId).toEqual({ in: [7] });
  });

  it("an Admin's forkable feed is not narrowed by roster", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    vi.mocked(visibleProjectIds).mockResolvedValue("all");
    await tasksGET(new Request("http://t/api/tasks?forkable=true"));
    const where = vi.mocked(prisma.task.findMany).mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.projectId).toBeUndefined();
    expect(rosteredProjectIds).not.toHaveBeenCalled();
  });

  it("without the flag a Developer still only sees their own tasks", async () => {
    vi.mocked(visibleProjectIds).mockResolvedValue([7]);
    await tasksGET(new Request("http://t/api/tasks"));
    const where = vi.mocked(prisma.task.findMany).mock.calls[0][0]!
      .where as Record<string, unknown>;
    expect(where.OR).toEqual([
      { assignees: { some: { userId: "u-Developer" } } },
      { responsibleId: "u-Developer" },
    ]);
    expect(where.NOT).toBeUndefined();
  });

  it("the feed is read-only — GET never writes", async () => {
    vi.mocked(visibleProjectIds).mockResolvedValue([7]);
    vi.mocked(rosteredProjectIds).mockResolvedValue([7]);
    await tasksGET(new Request("http://t/api/tasks?forkable=true"));
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});
