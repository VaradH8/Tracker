import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { DomainRole } from "@/lib/domain";

vi.mock("@/lib/db", () => ({
  prisma: {
    domainUser: { findMany: vi.fn(), count: vi.fn() },
    domainProject: { findMany: vi.fn() },
    domainTask: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    domainWorkLog: { findMany: vi.fn() },
    // KPIs derive from tags and approvals now, via projectForecasts()
    // and resourceForecast().
    domainAllocation: { findMany: vi.fn() },
    domainTagAssignment: { findMany: vi.fn(), groupBy: vi.fn() },
    domainTagSubmission: { findMany: vi.fn(), groupBy: vi.fn() },
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
    vi.mocked(prisma.domainTask.findUnique).mockReset();
    vi.mocked(prisma.domainTask.delete).mockReset();
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

  it("kpis: 200 for an Admin, and empty data yields empty KPIs", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.domainUser.findMany).mockResolvedValue([]);
    vi.mocked(prisma.domainTask.findMany).mockResolvedValue([]);
    vi.mocked(prisma.domainWorkLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.domainProject.findMany).mockResolvedValue([]);
    vi.mocked(prisma.domainAllocation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.domainTagAssignment.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.domainTagSubmission.findMany).mockResolvedValue([]);
    vi.mocked(prisma.domainTagSubmission.groupBy).mockResolvedValue([] as never);

    const res = await kpisGET();
    expect(res.status).toBe(200);

    // A fresh install must not report percentages derived from nothing —
    // 0/0 is "no data", not 0%.
    const body = await res.json();
    expect(body.totals.delivered30).toBe(0);
    expect(body.totals.approvalRate).toBeNull();
    expect(body.totals.medianReviewHours).toBeNull();
    expect(body.people).toEqual([]);
    expect(body.weeks).toHaveLength(6);
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

  /**
   * Deleting a task belongs to whoever handed it out, whatever their role,
   * plus managers clearing up after someone. These two cases are the whole
   * rule: same actor, different creator, opposite answers.
   */
  it("task delete: 403 for an Actionee deleting someone else's task", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    vi.mocked(prisma.domainTask.findUnique).mockResolvedValue({
      id: 1,
      createdById: "u-Admin",
      assigneeId: "u-Actionee",
    } as never);
    expect((await taskDELETE(delReq(), params("1"))).status).toBe(403);
    expect(prisma.domainTask.delete).not.toHaveBeenCalled();
  });

  it("task delete: an Actionee CAN delete a task they created themselves", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    vi.mocked(prisma.domainTask.findUnique).mockResolvedValue({
      id: 1,
      createdById: "u-Actionee",
      assigneeId: "u-Actionee",
    } as never);
    vi.mocked(prisma.domainTask.delete).mockResolvedValue({ id: 1 } as never);
    expect((await taskDELETE(delReq(), params("1"))).status).toBe(200);
  });

  it("task delete: a manager may delete a task they did not create", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    vi.mocked(prisma.domainTask.findUnique).mockResolvedValue({
      id: 1,
      createdById: "u-SME",
      assigneeId: "u-SME",
    } as never);
    vi.mocked(prisma.domainTask.delete).mockResolvedValue({ id: 1 } as never);
    expect((await taskDELETE(delReq(), params("1"))).status).toBe(200);
  });

  it("user delete: 403 for a Team Lead (admin only)", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    expect((await userDELETE(delReq(), params("u-x"))).status).toBe(403);
  });

});