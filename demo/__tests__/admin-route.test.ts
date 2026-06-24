import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  prisma: {
    appSettings: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  canManageUsers: (r: string) => r === "Admin",
  writeAudit: vi.fn(),
}));

import { requireUser } from "@/lib/server-access";
import { PATCH as settingsPATCH } from "@/app/api/settings/route";
import { GET as backupGET } from "@/app/api/admin/backup/route";

function actor(role: SessionUser["role"]): SessionUser {
  return {
    id: `u-${role}`,
    email: `${role}@x.com`,
    name: role,
    role,
    isAdmin: role === "Admin",
  };
}

describe("admin-only route gates", () => {
  beforeEach(() => vi.mocked(requireUser).mockReset());

  it("settings PATCH: 403 for a Coordinator", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
    const req = new Request("http://t/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smtpFrom: "x@y.com" }),
    });
    expect((await settingsPATCH(req)).status).toBe(403);
  });

  it("settings PATCH: 401 with no session", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const req = new Request("http://t/api/settings", { method: "PATCH", body: "{}" });
    expect((await settingsPATCH(req)).status).toBe(401);
  });

  it("backup export: 403 for a Developer", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    expect((await backupGET()).status).toBe(403);
  });
});