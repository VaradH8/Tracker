import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    task: { updateMany: vi.fn() },
    taskAttachment: { updateMany: vi.fn() },
    remark: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  createAccount: vi.fn(),
}));

vi.mock("@/lib/server-names", () => ({ refreshShortNames: vi.fn() }));

// Real gates (canManageStaff, staffChangeRefusal, reportingManagerProblem);
// only the session lookup is faked.
vi.mock("@/lib/server-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server-access")>()),
  requireUser: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { createAccount, type SessionUser } from "@/lib/auth";
import { requireUser } from "@/lib/server-access";
import { accessRole } from "@/lib/role-access";
import { POST } from "@/app/api/users/route";
import { DELETE, PATCH } from "@/app/api/users/[id]/route";
import type { Role } from "@/lib/role";

function actor(primary: Role, id = `u-${primary}`): SessionUser {
  return {
    id,
    email: `${primary.toLowerCase()}@example.com`,
    name: `Test ${primary}`,
    role: accessRole(primary),
    primaryRole: primary,
    isAdmin: primary === "Admin",
  };
}

const json = (method: string, body: unknown) =>
  new Request("http://x/api/users", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const DEV = { id: "dev-1", primaryRole: "Developer", isAdmin: false };
const ADMIN = { id: "adm-1", primaryRole: "Admin", isAdmin: true };
const LEAD = { primaryRole: "Lead", isAdmin: false, isActive: true };

function updatedRow(over: Record<string, unknown> = {}) {
  return {
    id: "dev-1",
    name: "Sanjana Jadhav",
    email: "sanjana@example.com",
    primaryRole: "Developer",
    isAdmin: false,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    designation: null,
    phone: null,
    location: null,
    hourlyRate: 0,
    capacityPerWeek: 40,
    reportingManagerId: null,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  const p = vi.mocked(prisma, true);
  p.user.findUnique.mockReset();
  p.user.findFirst.mockReset().mockResolvedValue(null as never);
  p.user.update.mockReset().mockImplementation((async (a: { data: Record<string, unknown> }) =>
    updatedRow(a.data)) as never);
  p.$transaction.mockReset().mockResolvedValue([] as never);
  vi.mocked(createAccount).mockReset().mockResolvedValue({
    ok: true,
    user: { id: "new-1", email: "n@example.com", name: "New", role: "Developer", isAdmin: false },
  } as never);
});

describe("Users — who manages staff", () => {
  it.each(["Lead", "Coordinator", "Developer", "BusinessDeveloper"] as const)(
    "403s a %s adding a user",
    async (role) => {
      vi.mocked(requireUser).mockResolvedValue(actor(role));
      const res = await POST(json("POST", { name: "N", email: "n@example.com", password: "Passw0rd!!", role: "Developer" }));
      expect(res.status).toBe(403);
      expect(createAccount).not.toHaveBeenCalled();
    },
  );

  it("lets HR add a Developer with a Reporting Manager", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(LEAD as never) // the manager check
      .mockResolvedValueOnce(updatedRow({ id: "new-1", reportingManagerId: "lead-1" }) as never);
    const res = await POST(
      json("POST", { name: "New", email: "n@example.com", password: "Passw0rd!!", role: "Developer", reportingManagerId: "lead-1" }),
    );
    expect(res.status).toBe(200);
    expect(createAccount).toHaveBeenCalled();
    expect(vi.mocked(prisma.user.update).mock.calls[0][0]).toMatchObject({
      where: { id: "new-1" },
      data: { reportingManagerId: "lead-1" },
    });
  });

  it("won't let HR create an Admin", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    const res = await POST(json("POST", { name: "N", email: "n@example.com", password: "Passw0rd!!", role: "Admin" }));
    expect(res.status).toBe(403);
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("refuses a Reporting Manager who isn't an active Admin or Lead", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ primaryRole: "Developer", isAdmin: false, isActive: true } as never);
    const res = await POST(json("POST", { name: "N", email: "n@example.com", password: "Passw0rd!!", role: "Developer", reportingManagerId: "dev-9" }));
    expect(res.status).toBe(400);
    expect(createAccount).not.toHaveBeenCalled();
  });
});

describe("Users — editing", () => {
  it("lets HR set a developer's Reporting Manager", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(DEV as never) // target, for HR's limits
      .mockResolvedValueOnce(LEAD as never); // the manager check
    const res = await PATCH(json("PATCH", { reportingManagerId: "lead-1" }), params("dev-1"));
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({ reportingManagerId: "lead-1" });
    expect((await res.json()).user.reportingManagerId).toBe("lead-1");
  });

  it("refuses a Reporting Manager for an Admin — they head the organisation", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(LEAD as never) // the manager check
      .mockResolvedValueOnce(ADMIN as never); // the employee is an Admin
    const res = await PATCH(json("PATCH", { reportingManagerId: "lead-1" }), params("adm-1"));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("making someone an Admin ends their reporting line", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    const res = await PATCH(json("PATCH", { role: "Admin" }), params("dev-1"));
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toMatchObject({
      primaryRole: "Admin",
      reportingManagerId: null,
    });
  });

  it("clears a Reporting Manager with null", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    const res = await PATCH(json("PATCH", { reportingManagerId: null }), params("dev-1"));
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toEqual({ reportingManagerId: null });
  });

  it("refuses making someone their own Reporting Manager", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    const res = await PATCH(json("PATCH", { reportingManagerId: "dev-1" }), params("dev-1"));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["edit an Admin's account", ADMIN, { name: "X" }],
    ["promote someone to Admin", DEV, { role: "Admin" }],
  ])("won't let HR %s", async (_, target, body) => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(target as never);
    const res = await PATCH(json("PATCH", body), params(target.id));
    expect(res.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("won't let HR change their own role", async () => {
    const hr = actor("HR", "hr-1");
    vi.mocked(requireUser).mockResolvedValue(hr);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: "hr-1", primaryRole: "HR", isAdmin: false } as never);
    const res = await PATCH(json("PATCH", { role: "Lead" }), params("hr-1"));
    expect(res.status).toBe(403);
  });

  it("lets HR change a developer's role, deactivate them and reset a password — but not their pay", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(DEV as never);
    const res = await PATCH(
      json("PATCH", { role: "Lead", active: false, password: "N3wPassword!", hourlyRate: 9999 }),
      params("dev-1"),
    );
    expect(res.status).toBe(200);
    const data = vi.mocked(prisma.user.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ primaryRole: "Lead", isAdmin: false, isActive: false });
    expect(data.passwordHash).toEqual(expect.any(String));
    expect(data).not.toHaveProperty("hourlyRate");
  });

  it("still lets a Developer edit only themselves", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "dev-2"));
    const res = await PATCH(json("PATCH", { name: "X" }), params("dev-1"));
    expect(res.status).toBe(403);
  });
});

describe("Users — deleting stays with Admin", () => {
  it("403s HR", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    const res = await DELETE(new Request("http://x"), params("dev-1"));
    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("401s an anonymous caller", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({}, { status: 401 }));
    expect((await DELETE(new Request("http://x"), params("dev-1"))).status).toBe(401);
  });
});
