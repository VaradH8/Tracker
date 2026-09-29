import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    timeEntry: { groupBy: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

// Keep the real role gate under test — only the session lookup is faked.
vi.mock("@/lib/server-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server-access")>()),
  requireUser: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server-access";
import { GET } from "@/app/api/resources/hours/route";
import type { SessionUser } from "@/lib/auth";

function actor(role: SessionUser["role"]): SessionUser {
  return {
    id: `u-${role}`,
    email: `${role.toLowerCase()}@example.com`,
    name: `Test ${role}`,
    role,
    isAdmin: role === "Admin",
  };
}

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(prisma.timeEntry.groupBy).mockReset().mockResolvedValue([
    { userId: "u-kiran", date: new Date("2026-09-16T00:00:00Z"), _sum: { hours: 6 } },
    { userId: "u-adil", date: new Date("2026-09-15T00:00:00Z"), _sum: { hours: null } },
  ] as never);
});

describe("GET /api/resources/hours — who may see team hour totals", () => {
  it("401s an anonymous caller", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await GET()).status).toBe(401);
    expect(prisma.timeEntry.groupBy).not.toHaveBeenCalled();
  });

  it.each(["Developer", "BusinessDeveloper"] as const)(
    "403s a %s and never queries",
    async (role) => {
      vi.mocked(requireUser).mockResolvedValue(actor(role));
      expect((await GET()).status).toBe(403);
      expect(prisma.timeEntry.groupBy).not.toHaveBeenCalled();
    },
  );

  it.each(["Admin", "Lead", "Coordinator"] as const)(
    "lets a %s see every person's totals, unscoped by project",
    async (role) => {
      vi.mocked(requireUser).mockResolvedValue(actor(role));
      const res = await GET();
      expect(res.status).toBe(200);

      const args = vi.mocked(prisma.timeEntry.groupBy).mock.calls[0][0] as {
        by: string[];
        where: Record<string, unknown>;
      };
      expect(args.by).toEqual(["userId", "date"]);
      // Only a date bound — no project / task filter narrowing it per viewer.
      expect(Object.keys(args.where)).toEqual(["date"]);
    },
  );

  it("returns totals only — no task, project or note fields", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
    const body = (await (await GET()).json()) as {
      days: Record<string, unknown>[];
    };
    expect(body.days).toEqual([
      { userId: "u-kiran", date: "2026-09-16", hours: 6 },
      { userId: "u-adil", date: "2026-09-15", hours: 0 },
    ]);
    for (const d of body.days) {
      expect(Object.keys(d).sort()).toEqual(["date", "hours", "userId"]);
    }
  });
});
