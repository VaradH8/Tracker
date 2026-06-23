import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { DomainRole } from "@/lib/domain";

vi.mock("@/lib/db", () => ({
  prisma: {
    domainUser: { findMany: vi.fn(), count: vi.fn() },
    domainProject: { findMany: vi.fn() },
  },
}));

// Real role gate, mocked session resolver — lets us drive the caller's role.
vi.mock("@/lib/domain-auth", () => ({
  requireDomainUser: vi.fn(),
  requireDomainRole: (
    user: { role: DomainRole },
    allowed: DomainRole[],
  ) =>
    allowed.includes(user.role)
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  createDomainAccount: vi.fn(),
}));

import { requireDomainUser } from "@/lib/domain-auth";
import { GET as availabilityGET } from "@/app/api/domain/availability/route";
import { POST as usersPOST } from "@/app/api/domain/projects/route";

function actor(role: DomainRole) {
  return { id: `u-${role}`, email: `${role}@x.com`, name: role, role };
}

describe("domain route role gates", () => {
  beforeEach(() => {
    vi.mocked(requireDomainUser).mockReset();
  });

  it("availability: 401 when no session", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await availabilityGET()).status).toBe(401);
  });

  it("availability: 403 for an Actionee", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    expect((await availabilityGET()).status).toBe(403);
  });

  it("availability: 403 for a Team Lead", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    expect((await availabilityGET()).status).toBe(403);
  });

  it("project create: 403 for an Actionee", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    const req = new Request("http://test/api/domain/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect((await usersPOST(req)).status).toBe(403);
  });

  it("project create: 403 for a Team Lead (only Lead/Admin own projects)", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    const req = new Request("http://test/api/domain/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect((await usersPOST(req)).status).toBe(403);
  });
});