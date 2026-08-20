import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  isProjectMember: vi.fn(),
  visibleProjectIds: vi.fn(),
  notifyUser: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

import { prisma } from "@/lib/db";
import {
  isProjectMember,
  notifyUser,
  requireUser,
  visibleProjectIds,
  writeAudit,
} from "@/lib/server-access";
import { POST as forkPOST } from "@/app/api/tasks/[id]/fork/route";

function actor(role: SessionUser["role"], id = `u-${role}`): SessionUser {
  return { id, email: `${role}@x.com`, name: role, role, isAdmin: role === "Admin" };
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(id = "5") {
  return new Request(`http://t/api/tasks/${id}/fork`, { method: "POST" });
}

/** A task owned by someone other than the caller. */
function sourceTask(over: Record<string, unknown> = {}) {
  return {
    id: 5,
    title: "Wire up the export job",
    description: "CSV export times out over 50k rows",
    projectId: 7,
    priority: "High",
    status: "In Progress",
    startDate: null,
    targetDate: new Date("2026-09-01"),
    estimatedHours: 6,
    important: true,
    responsibleId: "u-Lead",
    assignees: [{ userId: "u-other" }],
    project: { name: "Atlas" },
    ...over,
  };
}

/** What prisma.task.create resolves to — enough for serializeTask. */
function createdFork() {
  return {
    id: 12,
    title: "Wire up the export job",
    description: "CSV export times out over 50k rows",
    projectId: 7,
    priority: "High",
    status: "To Do",
    startDate: null,
    targetDate: new Date("2026-09-01"),
    estimatedHours: 6,
    actualHours: null,
    important: true,
    overdueDays: null,
    completedAt: null,
    responsibleId: "u-Developer",
    responsible: { name: "Dev Person" },
    approvedById: null,
    approvedBy: null,
    approvedAt: null,
    forkedFromId: 5,
    forkedAt: new Date("2026-08-20"),
    assignees: [{ user: { name: "Dev Person" } }],
    remarks: [],
    attachments: [],
    blockedBy: [],
    project: { name: "Atlas" },
  };
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(isProjectMember).mockReset();
  vi.mocked(visibleProjectIds).mockReset();
  vi.mocked(prisma.task.findUnique).mockReset();
  vi.mocked(prisma.task.create).mockReset();
  vi.mocked(notifyUser).mockReset();
  vi.mocked(writeAudit).mockReset();
});

describe("POST /api/tasks/[id]/fork — permission gates", () => {
  it("401 when signed out", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await forkPOST(req(), params("5"));
    expect(res.status).toBe(401);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("400 on a non-numeric task id", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    const res = await forkPOST(req("abc"), params("abc"));
    expect(res.status).toBe(400);
    expect(prisma.task.findUnique).not.toHaveBeenCalled();
  });

  it("404 when the task does not exist", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(null);
    const res = await forkPOST(req(), params("5"));
    expect(res.status).toBe(404);
  });

  it("403 for a Developer on a project outside their scope", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(sourceTask() as never);
    vi.mocked(visibleProjectIds).mockResolvedValue([99]); // not project 7
    vi.mocked(isProjectMember).mockResolvedValue(true);
    const res = await forkPOST(req(), params("5"));
    expect(res.status).toBe(403);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("403 for a Developer who can see the project but is not rostered on it", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(sourceTask() as never);
    vi.mocked(visibleProjectIds).mockResolvedValue([7]);
    vi.mocked(isProjectMember).mockResolvedValue(false);
    const res = await forkPOST(req(), params("5"));
    expect(res.status).toBe(403);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("400 when the task is already the caller's own work", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(
      sourceTask({ assignees: [{ userId: "u-Developer" }] }) as never,
    );
    vi.mocked(visibleProjectIds).mockResolvedValue([7]);
    vi.mocked(isProjectMember).mockResolvedValue(true);
    const res = await forkPOST(req(), params("5"));
    expect(res.status).toBe(400);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it("400 when the caller is the responsible owner", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(
      sourceTask({ responsibleId: "u-Developer" }) as never,
    );
    vi.mocked(visibleProjectIds).mockResolvedValue([7]);
    vi.mocked(isProjectMember).mockResolvedValue(true);
    const res = await forkPOST(req(), params("5"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/tasks/[id]/fork — the fork itself", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    vi.mocked(prisma.task.findUnique).mockResolvedValue(sourceTask() as never);
    vi.mocked(visibleProjectIds).mockResolvedValue([7]);
    vi.mocked(isProjectMember).mockResolvedValue(true);
    vi.mocked(prisma.task.create).mockResolvedValue(createdFork() as never);
  });

  it("201, assigned to the forker, owned by the forker, linked to the original", async () => {
    const res = await forkPOST(req(), params("5"));
    expect(res.status).toBe(201);

    const data = vi.mocked(prisma.task.create).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.responsibleId).toBe("u-Developer");
    expect(data.forkedFromId).toBe(5);
    expect(data.forkedAt).toBeInstanceOf(Date);
    expect(data.assignees).toEqual({ create: [{ userId: "u-Developer" }] });
    expect(data.projectId).toBe(7);
  });

  it("copies the brief but not the original's progress", async () => {
    await forkPOST(req(), params("5"));
    const data = vi.mocked(prisma.task.create).mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.title).toBe("Wire up the export job");
    expect(data.description).toBe("CSV export times out over 50k rows");
    expect(data.priority).toBe("High");
    expect(data.estimatedHours).toBe(6);
    // A fork starts fresh — it does not inherit "In Progress".
    expect(data.status).toBe("To Do");
    expect(data).not.toHaveProperty("actualHours");
    expect(data).not.toHaveProperty("approvedById");
    expect(data).not.toHaveProperty("completedAt");
  });

  it("never mutates the original task", async () => {
    await forkPOST(req(), params("5"));
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
    // No update path exists on this route at all.
    expect(prisma.task).not.toHaveProperty("update");
  });

  it("notifies the original's owner and assignees, but not the forker", async () => {
    await forkPOST(req(), params("5"));
    const notified = vi.mocked(notifyUser).mock.calls.map((c) => c[0]);
    expect(new Set(notified)).toEqual(new Set(["u-Lead", "u-other"]));
    expect(notified).not.toContain("u-Developer");
  });

  it("writes an audit entry naming both ends of the fork", async () => {
    await forkPOST(req(), params("5"));
    expect(writeAudit).toHaveBeenCalledWith(
      "u-Developer",
      "task.fork",
      expect.objectContaining({ before: "#5", after: "#12" }),
    );
  });

  it("serialises the fork's lineage back to the client", async () => {
    const res = await forkPOST(req(), params("5"));
    const body = await res.json();
    expect(body.task.forkedFromId).toBe(5);
    expect(body.task.forkedAt).toBe("2026-08-20");
    expect(body.task.status).toBe("To Do");
  });
});
