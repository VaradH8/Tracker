import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";

/* Shared prisma mock — only the delegates these two routes touch. */
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: vi.fn(), update: vi.fn() },
    task: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    emailLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

/* Mock the access layer so we drive the gates directly. canEditTasks keeps
 * its real semantics (Admin/Lead/Coordinator); canAccessProject is a spy we
 * flip per test. */
vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canEditTasks: (r: string) => r === "Admin" || r === "Lead" || r === "Coordinator",
  canManageUsers: (r: string) => r === "Admin",
  canAccessProject: vi.fn(),
  userByFirstName: vi.fn(),
  writeAudit: vi.fn(),
}));

import { requireUser, canAccessProject, userByFirstName } from "@/lib/server-access";
import { __resetRateLimits } from "@/lib/rate-limit";
import { PATCH as projectPATCH } from "@/app/api/projects/[id]/route";
import { POST as notifyPOST } from "@/app/api/notifications/route";

function actor(role: SessionUser["role"], id = `u-${role}`): SessionUser {
  return { id, email: `${role}@x.com`, name: role, role, isAdmin: role === "Admin" };
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(canAccessProject).mockReset();
  vi.mocked(userByFirstName).mockReset();
  __resetRateLimits();
});

describe("PATCH /api/projects/[id] — per-project scoping (A1)", () => {
  it("403 for a Coordinator on a project they can't access (the IDOR fix)", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
    vi.mocked(canAccessProject).mockResolvedValue(false);
    const req = new Request("http://t/api/projects/7", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hijacked" }),
    });
    const res = await projectPATCH(req, params("7"));
    expect(res.status).toBe(403);
    expect(vi.mocked(canAccessProject)).toHaveBeenCalledWith(
      expect.objectContaining({ role: "Coordinator" }),
      7,
    );
  });

  it("403 for a Developer regardless (no task-edit authority)", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    const req = new Request("http://t/api/projects/7", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
    });
    expect((await projectPATCH(req, params("7"))).status).toBe(403);
  });
});

describe("POST /api/notifications — task binding + rate limit (A2)", () => {
  function body(extra: Record<string, unknown>) {
    return new Request("http://t/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: "Sam", title: "hi", ...extra }),
    });
  }

  it("400 when no task is referenced", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-a"));
    expect((await notifyPOST(body({}))).status).toBe(400);
  });

  it("404 when the referenced task doesn't exist", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-b"));
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.task.findUnique).mockResolvedValue(null as never);
    expect((await notifyPOST(body({ taskId: 99 }))).status).toBe(404);
  });

  it("403 when the actor can't access the task's project", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-c"));
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.task.findUnique).mockResolvedValue({ projectId: 3 } as never);
    vi.mocked(canAccessProject).mockResolvedValue(false);
    expect((await notifyPOST(body({ taskId: 5 }))).status).toBe(403);
  });

  it("429 once the per-actor rate limit is exceeded", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "u-flood"));
    // 30 allowed, 31st blocked. Body is intentionally minimal — the rate
    // gate runs before any validation, so the status of the allowed calls
    // doesn't matter here.
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await notifyPOST(body({}))).status;
    }
    expect(last).toBe(429);
  });
});
