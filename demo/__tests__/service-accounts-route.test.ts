import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    apiToken: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canManageUsers: (role: string) => role === "Admin",
  writeAudit: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server-access";
import { GET, POST } from "@/app/api/admin/service-accounts/route";
import { PATCH } from "@/app/api/admin/service-accounts/[id]/route";
import { DELETE } from "@/app/api/admin/service-accounts/[id]/tokens/[tokenId]/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function actor(role: SessionUser["role"]): SessionUser {
  return { id: `u-${role}`, email: `${role}@x.com`, name: role, role, isAdmin: role === "Admin" };
}
const json = (body: unknown) =>
  new Request("http://t/api/admin/service-accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("service-account admin routes", () => {
  for (const role of ["Lead", "Coordinator", "HR", "Developer", "BusinessDeveloper"] as const) {
    it(`${role} gets 403 on every route`, async () => {
      vi.mocked(requireUser).mockResolvedValue(actor(role));
      expect((await GET()).status).toBe(403);
      expect((await POST(json({ email: "pm@x.com" }))).status).toBe(403);
      expect(
        (await PATCH(json({ active: false }), { params: Promise.resolve({ id: "svc" }) })).status,
      ).toBe(403);
      expect(
        (await DELETE(json({}), { params: Promise.resolve({ id: "svc", tokenId: "1" }) })).status,
      ).toBe(403);
      expect(db.user.update).not.toHaveBeenCalled();
      expect(db.apiToken.update).not.toHaveBeenCalled();
    });
  }

  it("Admin can disable a service account (kill switch)", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    db.user.findUnique.mockResolvedValue({ isServiceAccount: true, email: "pm@x.com" });
    const res = await PATCH(json({ active: false }), { params: Promise.resolve({ id: "svc" }) });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "svc" }, data: { isActive: false } });
  });

  it("the kill switch cannot be pointed at a person's account", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    db.user.findUnique.mockResolvedValue({ isServiceAccount: false, email: "ravi@x.com" });
    const res = await PATCH(json({ active: false }), { params: Promise.resolve({ id: "u-ravi" }) });
    expect(res.status).toBe(404);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses to turn a person's email into a service account", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    db.user.findUnique.mockResolvedValue({ id: "u-ravi", isServiceAccount: false });
    const res = await POST(json({ email: "ravi@x.com" }));
    expect(res.status).toBe(409);
    expect(db.apiToken.create).not.toHaveBeenCalled();
  });
});
