import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma BEFORE importing the helpers under test — the helpers
// reach for prisma at module load via their import.
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findMany: vi.fn() },
    projectMember: { findMany: vi.fn(), findFirst: vi.fn() },
    taskAssignee: { findMany: vi.fn(), findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));

// `next/headers` pulls from a context that isn't there in the test
// runner. Stub it out so anything that imports auth.ts doesn't blow up.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

import { prisma } from "@/lib/db";
import {
  canAccessProject,
  canEditTasks,
  canManageProjectTasks,
  canManageUsers,
  canSeeProjectAudit,
  visibleProjectIds,
} from "@/lib/server-access";
import type { SessionUser } from "@/lib/auth";

function userWithRole(role: SessionUser["role"]): SessionUser {
  return {
    id: `user-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@example.com`,
    name: `Test ${role}`,
    role,
    isAdmin: role === "Admin",
  };
}

describe("role gate helpers (synchronous)", () => {
  it("canEditTasks: Admin + Coordinator only", () => {
    expect(canEditTasks("Admin")).toBe(true);
    expect(canEditTasks("Coordinator")).toBe(true);
    expect(canEditTasks("Developer")).toBe(false);
    expect(canEditTasks("BusinessDeveloper")).toBe(false);
  });

  it("canManageUsers: Admin only", () => {
    expect(canManageUsers("Admin")).toBe(true);
    expect(canManageUsers("Coordinator")).toBe(false);
    expect(canManageUsers("Developer")).toBe(false);
    expect(canManageUsers("BusinessDeveloper")).toBe(false);
  });

  it("canSeeProjectAudit: Admin + Coordinator only", () => {
    expect(canSeeProjectAudit("Admin")).toBe(true);
    expect(canSeeProjectAudit("Coordinator")).toBe(true);
    expect(canSeeProjectAudit("Developer")).toBe(false);
    expect(canSeeProjectAudit("BusinessDeveloper")).toBe(false);
  });
});

describe("visibleProjectIds", () => {
  beforeEach(() => {
    vi.mocked(prisma.projectMember.findMany).mockReset();
    vi.mocked(prisma.taskAssignee.findMany).mockReset();
  });

  it("Admin sees every project (returns 'all')", async () => {
    const result = await visibleProjectIds(userWithRole("Admin"));
    expect(result).toBe("all");
    // And we should not have touched the DB at all.
    expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
  });

  it("Coordinator no longer gets the god view — only assigned projects", async () => {
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([
      { projectId: 1 },
      { projectId: 3 },
    ] as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([] as never);
    const result = await visibleProjectIds(userWithRole("Coordinator"));
    expect(result).toEqual([1, 3]);
  });

  it("Developer with no memberships and no task assignments sees nothing", async () => {
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([] as never);
    const result = await visibleProjectIds(userWithRole("Developer"));
    expect(result).toEqual([]);
  });

  it("Developer with task on a project they're not rostered on still sees it (fallback)", async () => {
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([
      { task: { projectId: 42 } },
    ] as never);
    const result = await visibleProjectIds(userWithRole("Developer"));
    expect(result).toEqual([42]);
  });

  it("dedupes when membership and task assignment overlap", async () => {
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([
      { projectId: 5 },
    ] as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([
      { task: { projectId: 5 } },
      { task: { projectId: 6 } },
    ] as never);
    const result = await visibleProjectIds(userWithRole("Developer"));
    expect(new Set(result as number[])).toEqual(new Set([5, 6]));
  });
});

describe("canAccessProject", () => {
  beforeEach(() => {
    vi.mocked(prisma.projectMember.findMany).mockReset();
    vi.mocked(prisma.taskAssignee.findMany).mockReset();
  });

  it("admin → true regardless of project", async () => {
    expect(await canAccessProject(userWithRole("Admin"), 1)).toBe(true);
    expect(await canAccessProject(userWithRole("Admin"), 9999)).toBe(true);
  });

  it("non-admin → true only for projects they're on", async () => {
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([
      { projectId: 7 },
    ] as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([] as never);
    expect(await canAccessProject(userWithRole("Developer"), 7)).toBe(true);
    // The next call re-reads — repeat the mock for the second call.
    vi.mocked(prisma.projectMember.findMany).mockResolvedValue([
      { projectId: 7 },
    ] as never);
    vi.mocked(prisma.taskAssignee.findMany).mockResolvedValue([] as never);
    expect(await canAccessProject(userWithRole("Developer"), 8)).toBe(false);
  });
});

describe("canManageProjectTasks", () => {
  beforeEach(() => {
    vi.mocked(prisma.projectMember.findFirst).mockReset();
  });

  it("global Admin → true without touching the DB", async () => {
    expect(
      await canManageProjectTasks(userWithRole("Admin"), 1),
    ).toBe(true);
    expect(prisma.projectMember.findFirst).not.toHaveBeenCalled();
  });

  it("global Coordinator → true without touching the DB", async () => {
    expect(
      await canManageProjectTasks(userWithRole("Coordinator"), 1),
    ).toBe(true);
    expect(prisma.projectMember.findFirst).not.toHaveBeenCalled();
  });

  it("global Developer who is a Lead on this project → true (per-project authority)", async () => {
    vi.mocked(prisma.projectMember.findFirst).mockResolvedValue({
      userId: "user-developer",
    } as never);
    expect(
      await canManageProjectTasks(userWithRole("Developer"), 42),
    ).toBe(true);
  });

  it("global Developer with no Lead/Coord row on this project → false", async () => {
    vi.mocked(prisma.projectMember.findFirst).mockResolvedValue(null);
    expect(
      await canManageProjectTasks(userWithRole("Developer"), 42),
    ).toBe(false);
  });

  it("BD who created the project (and so is rostered as Coordinator) → true", async () => {
    vi.mocked(prisma.projectMember.findFirst).mockResolvedValue({
      userId: "user-businessdeveloper",
    } as never);
    expect(
      await canManageProjectTasks(userWithRole("BusinessDeveloper"), 7),
    ).toBe(true);
  });
});
