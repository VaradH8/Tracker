import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    leave: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  notifyUser: vi.fn(async () => undefined),
  writeAudit: vi.fn(async () => undefined),
}));

import { prisma } from "@/lib/db";
import { notifyUser, requireUser } from "@/lib/server-access";
import { PATCH } from "@/app/api/leaves/route";
import { DELETE } from "@/app/api/leaves/[id]/route";
import type { SessionUser } from "@/lib/auth";

function actor(id: string, role: SessionUser["role"]): SessionUser {
  return {
    id,
    email: `${id}@example.com`,
    name: `Test ${role}`,
    role,
    isAdmin: role === "Admin",
  };
}

function leaveRow(userId: string, role: string, approved = false) {
  return {
    id: 7,
    userId,
    user: { id: userId, name: `Owner ${role}`, primaryRole: role },
    start: new Date("2026-10-01T00:00:00Z"),
    end: new Date("2026-10-02T00:00:00Z"),
    type: "Casual Leave",
    note: null,
    approved,
  };
}

function patchReq(body: unknown) {
  return new Request("http://test/api/leaves", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/leaves (approval)", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(prisma.leave.findUnique).mockReset();
    vi.mocked(prisma.leave.update).mockReset();
    vi.mocked(notifyUser).mockClear();
  });

  it("refuses a Coordinator approving their own leave", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("c1", "Coordinator"));
    vi.mocked(prisma.leave.findUnique).mockResolvedValue(leaveRow("c1", "Coordinator") as never);

    const res = await PATCH(patchReq({ id: 7, approved: true }));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/own leave/);
    expect(prisma.leave.update).not.toHaveBeenCalled();
  });

  it("refuses a Coordinator approving another Coordinator's leave", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("c1", "Coordinator"));
    vi.mocked(prisma.leave.findUnique).mockResolvedValue(leaveRow("c2", "Coordinator") as never);

    const res = await PATCH(patchReq({ id: 7, approved: true }));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/senior/);
    expect(prisma.leave.update).not.toHaveBeenCalled();
  });

  it("lets a Coordinator approve a Developer's leave and notifies them", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("c1", "Coordinator"));
    vi.mocked(prisma.leave.findUnique).mockResolvedValue(leaveRow("d1", "Developer") as never);
    vi.mocked(prisma.leave.update).mockResolvedValue(leaveRow("d1", "Developer", true) as never);

    const res = await PATCH(patchReq({ id: 7, approved: true }));

    expect(res.status).toBe(200);
    expect(prisma.leave.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { approved: true } }),
    );
    expect(notifyUser).toHaveBeenCalledWith("d1", expect.objectContaining({ kind: "leave_approved" }));
  });

  it("lets an Admin approve a Coordinator's leave", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("a1", "Admin"));
    vi.mocked(prisma.leave.findUnique).mockResolvedValue(leaveRow("c1", "Coordinator") as never);
    vi.mocked(prisma.leave.update).mockResolvedValue(leaveRow("c1", "Coordinator", true) as never);

    const res = await PATCH(patchReq({ id: 7, approved: true }));

    expect(res.status).toBe(200);
    expect((await res.json()).leave).toMatchObject({ approved: true, role: "Coordinator" });
  });

  it("refuses a Developer outright", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("d1", "Developer"));
    vi.mocked(prisma.leave.findUnique).mockResolvedValue(leaveRow("d2", "Developer") as never);

    const res = await PATCH(patchReq({ id: 7, approved: true }));

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/leaves/[id] (cancel / deny)", () => {
  const ctx = { params: Promise.resolve({ id: "7" }) };

  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(prisma.leave.findUnique).mockReset();
    vi.mocked(prisma.leave.delete).mockReset();
    vi.mocked(notifyUser).mockClear();
  });

  it("a Coordinator can still cancel their own request", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("c1", "Coordinator"));
    vi.mocked(prisma.leave.findUnique).mockResolvedValue(leaveRow("c1", "Coordinator") as never);

    const res = await DELETE(new Request("http://test"), ctx);

    expect(res.status).toBe(200);
    expect(prisma.leave.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    // Cancelling your own request is not a denial — nobody is notified.
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("a Coordinator cannot deny a peer Coordinator's request", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("c1", "Coordinator"));
    vi.mocked(prisma.leave.findUnique).mockResolvedValue(leaveRow("c2", "Coordinator") as never);

    const res = await DELETE(new Request("http://test"), ctx);

    expect(res.status).toBe(403);
    expect(prisma.leave.delete).not.toHaveBeenCalled();
  });

  it("a Coordinator denying a Developer's pending request notifies them", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("c1", "Coordinator"));
    vi.mocked(prisma.leave.findUnique).mockResolvedValue(leaveRow("d1", "Developer") as never);

    const res = await DELETE(new Request("http://test"), ctx);

    expect(res.status).toBe(200);
    expect(notifyUser).toHaveBeenCalledWith("d1", expect.objectContaining({ kind: "leave_denied" }));
  });
});
