import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { user: { findMany: vi.fn(), findUnique: vi.fn() } },
}));
// Importing the real auth.ts pulls next/headers; the GET path doesn't use
// createAccount, so stub it.
vi.mock("@/lib/auth", () => ({ createAccount: vi.fn() }));
vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canManageUsers: (r: string) => r === "Admin",
}));

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server-access";
import { GET } from "@/app/api/users/route";
import type { SessionUser } from "@/lib/auth";

function actor(role: SessionUser["role"]): SessionUser {
  return {
    id: `u-${role}`,
    email: `${role}@example.com`,
    name: `Test ${role}`,
    role,
    isAdmin: role === "Admin",
  };
}

function dbRow(role: string) {
  return {
    id: "dev1",
    email: "asha.dev@example.com",
    name: "Asha Developer",
    primaryRole: role,
    isAdmin: role === "Admin",
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    designation: "Engineer",
    phone: "9999999999",
    location: "Pune",
    hourlyRate: 1500,
    capacityPerWeek: 40,
  };
}

describe("GET /api/users", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(prisma.user.findMany).mockReset();
  });

  it("gives a Coordinator the roster (names + roles) with HR fields redacted", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
    vi.mocked(prisma.user.findMany).mockResolvedValue([dbRow("Developer")] as never);

    const res = await GET();
    const body = await res.json();

    // Only active users are queried for the roster.
    expect(vi.mocked(prisma.user.findMany).mock.calls[0][0]).toMatchObject({
      where: { isActive: true },
    });
    const u = body.users[0];
    // Identity + role survive so the assignee / team pickers work…
    expect(u.name).toBe("Asha Developer");
    expect(u.role).toBe("Developer");
    expect(u.active).toBe(true);
    // …but salary / personal contact details are scrubbed.
    expect(u.hourlyRate).toBe(0);
    expect(u.phone).toBe("");
    expect(u.location).toBe("");
  });

  it("gives an Admin the full records including HR fields", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.user.findMany).mockResolvedValue([dbRow("Developer")] as never);

    const res = await GET();
    const body = await res.json();
    const u = body.users[0];
    expect(u.hourlyRate).toBe(1500);
    expect(u.phone).toBe("9999999999");
    expect(u.location).toBe("Pune");
  });
});