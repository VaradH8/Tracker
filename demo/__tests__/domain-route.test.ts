import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { DomainRole } from "@/lib/domain";

vi.mock("@/lib/db", () => ({
  prisma: {
    domainUser: { findMany: vi.fn(), count: vi.fn() },
    domainProject: { findMany: vi.fn() },
    domainTask: { findMany: vi.fn() },
    domainWorkLog: { findMany: vi.fn() },
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
import { prisma } from "@/lib/db";
import { POST as bulkTasksPOST } from "@/app/api/domain/tasks/bulk/route";
import { GET as kpisGET } from "@/app/api/domain/kpis/route";
import { POST as usersPOST } from "@/app/api/domain/projects/route";
import { DELETE as taskDELETE } from "@/app/api/domain/tasks/[id]/route";
import { DELETE as userDELETE } from "@/app/api/domain/users/[id]/route";

function delReq() {
  return new Request("http://test/x", { method: "DELETE" });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function actor(role: DomainRole) {
  return { id: `u-${role}`, email: `${role}@x.com`, name: role, role };
}

describe("domain route role gates", () => {
  beforeEach(() => {
    vi.mocked(requireDomainUser).mockReset();
  });





  it("kpis: 401 when no session", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await kpisGET()).status).toBe(401);
  });

  it("kpis: 403 for a Lead (admin-only)", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Lead"));
    expect((await kpisGET()).status).toBe(403);
  });

  it("kpis: 403 for an Actionee", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    expect((await kpisGET()).status).toBe(403);
  });

  it("kpis: 200 for an Admin", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainUser.findMany).mockResolvedValue([]);
    vi.mocked(prisma.domainTask.findMany).mockResolvedValue([]);
    vi.mocked(prisma.domainWorkLog.findMany).mockResolvedValue([]);
    expect((await kpisGET()).status).toBe(200);
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

  it("task delete: 403 for an Actionee (managers only)", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    expect((await taskDELETE(delReq(), params("1"))).status).toBe(403);
  });

  it("user delete: 403 for a Team Lead (admin only)", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    expect((await userDELETE(delReq(), params("u-x"))).status).toBe(403);
  });

  it("bulk task create: 403 for an Actionee (managers only)", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    const req = new Request("http://test/api/domain/tasks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: 1, titlePrefix: "Support", count: 20 }),
    });
    expect((await bulkTasksPOST(req)).status).toBe(403);
  });

  it("bulk task create: 401 when no session", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const req = new Request("http://test/api/domain/tasks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: 1, titlePrefix: "Support", count: 20 }),
    });
    expect((await bulkTasksPOST(req)).status).toBe(401);
  });
});