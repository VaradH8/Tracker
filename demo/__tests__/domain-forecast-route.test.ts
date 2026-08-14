import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import type { DomainRole } from "@/lib/domain";

/**
 * Role gates on the forecast / tag-approval endpoints. Follows the pattern
 * in domain-route.test.ts: the real role check runs, the session resolver
 * is mocked so we can drive who's calling.
 */

vi.mock("@/lib/db", () => ({
  prisma: {
    domainUser: { findMany: vi.fn(), findUnique: vi.fn() },
    domainProject: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    domainDivision: { findMany: vi.fn(), create: vi.fn() },
    domainAllocation: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    domainTagAssignment: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn(), create: vi.fn(), update: vi.fn() },
    domainTagSubmission: { findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/domain-auth", () => ({
  requireDomainUser: vi.fn(),
  requireDomainRole: (user: { role: DomainRole }, allowed: DomainRole[]) =>
    allowed.includes(user.role)
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  createDomainAccount: vi.fn(),
}));

import { requireDomainUser } from "@/lib/domain-auth";
import { prisma } from "@/lib/db";
import { GET as forecastGET } from "@/app/api/domain/forecast/route";
import { POST as simulatePOST } from "@/app/api/domain/forecast/simulate/route";
import { GET as allocationsGET, POST as allocationsPOST } from "@/app/api/domain/allocations/route";
import { GET as conflictsGET } from "@/app/api/domain/allocations/conflicts/route";
import { PATCH as allocationPATCH, DELETE as allocationDELETE } from "@/app/api/domain/allocations/[id]/route";
import { POST as tagAssignPOST } from "@/app/api/domain/tag-assignments/route";
import { PATCH as reviewPATCH } from "@/app/api/domain/tag-submissions/[id]/route";
import { POST as submissionPOST } from "@/app/api/domain/tag-submissions/route";
import { POST as divisionsPOST } from "@/app/api/domain/divisions/route";
import { POST as usersPOST } from "@/app/api/domain/users/route";

function actor(role: DomainRole) {
  return { id: `u-${role}`, email: `${role}@x.com`, name: role, role };
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown = {}, url = "http://test/x") =>
  new Request(url, { method: "POST", body: JSON.stringify(body) });
const getReq = (url = "http://test/x") => new Request(url);

/**
 * Oversight: a Team Lead reviews submissions and sees the whole delivery
 * picture, alongside Leads and Admins.
 */
const SUPERVISOR_OK: [string, () => Promise<Response>][] = [
  ["forecast", () => forecastGET(getReq())],
  ["simulate", () => simulatePOST(req({ totalTags: 10, resourceIds: ["a"] }))],
  ["allocations list", () => allocationsGET(getReq())],
  ["conflict check", () => conflictsGET(getReq("http://test/x?userId=a&startDate=2026-01-01&endDate=2026-01-02"))],
  ["submission review", () => reviewPATCH(req({ action: "approve" }), params("1"))],
];

/**
 * Structural and destructive changes — who is on the team, what projects
 * exist, who is booked where. A Team Lead is deliberately kept out.
 */
const LEAD_ONLY: [string, () => Promise<Response>][] = [
  ["allocation create", () => allocationsPOST(req({ projectId: 1, userId: "a" }))],
  ["allocation update", () => allocationPATCH(req(), params("1"))],
  ["allocation delete", () => allocationDELETE(new Request("http://test/x", { method: "DELETE" }), params("1"))],
  ["division create", () => divisionsPOST(req({ name: "Electrical" }))],
];

describe("forecast + approval route role gates", () => {
  beforeEach(() => {
    vi.mocked(requireDomainUser).mockReset();
    // Safe defaults for every read, so a handler that legitimately gets
    // past its role gate returns something deterministic instead of
    // tripping over an unmocked call — and so no test depends on what a
    // previous one happened to leave behind.
    vi.mocked(prisma.domainUser.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.domainUser.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.domainProject.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.domainProject.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.domainDivision.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.domainAllocation.findMany).mockReset();
    vi.mocked(prisma.domainAllocation.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.domainTagAssignment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.domainTagAssignment.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.domainTagSubmission.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.domainTagSubmission.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.domainTagSubmission.groupBy).mockResolvedValue([] as never);
  });

  for (const [label, call] of [...SUPERVISOR_OK, ...LEAD_ONLY]) {
    it(`${label}: 401 without a session`, async () => {
      vi.mocked(requireDomainUser).mockResolvedValue(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
      expect((await call()).status).toBe(401);
    });

    it(`${label}: 403 for an Actionee`, async () => {
      vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
      expect((await call()).status).toBe(403);
    });
  }

  for (const [label, call] of LEAD_ONLY) {
    it(`${label}: 403 for a Team Lead — structural changes stay with Leads`, async () => {
      vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
      expect((await call()).status).toBe(403);
    });
  }

  for (const [label, call] of SUPERVISOR_OK) {
    it(`${label}: a Team Lead is let through the gate`, async () => {
      vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
      expect((await call()).status).not.toBe(403);
    });
  }

  it("a Team Lead's own tags are approved on submission; an Actionee's wait", async () => {
    const assignment = (role: DomainRole) => ({
      id: 1,
      assigneeId: "u-" + role,
      assignedCount: 100,
      deliveredCount: 0,
      submissions: [],
      assignee: { role },
    });

    for (const [role, expected] of [
      ["TeamLead", "Approved"],
      ["Actionee", undefined],
    ] as const) {
      vi.mocked(requireDomainUser).mockResolvedValue(actor(role));
      vi.mocked(prisma.domainTagAssignment.findUnique).mockResolvedValue(
        assignment(role) as never,
      );
      // Shaped for serialize(), which runs on the way out.
      const row = {
        id: 9,
        assignmentId: 1,
        date: new Date("2026-08-14"),
        completedCount: 5,
        status: "Pending",
        approvedCount: null,
        note: null,
        reviewNote: null,
        reviewedAt: null,
        createdAt: new Date("2026-08-14"),
        assignment: {
          assignedCount: 100,
          deliveredCount: 0,
          project: { id: 1, name: "P", client: null },
          division: null,
          assignee: { id: "u-" + role, name: role },
        },
        submittedBy: { id: "u-" + role, name: role },
        reviewedBy: null,
      };
      const created = vi.fn().mockResolvedValue(row);
      const moved = vi.fn().mockResolvedValue({ count: 1 });
      // Run the callback against a stub transaction client.
      vi.mocked(prisma.$transaction).mockImplementation((async (
        fn: (tx: unknown) => Promise<unknown>,
      ) =>
        fn({
          domainTagAssignment: {
            findUnique: async () => assignment(role),
            updateMany: moved,
          },
          domainTagSubmission: { create: created },
        })) as never);
      vi.mocked(prisma.domainTagSubmission.findUnique).mockResolvedValue(
        row as never,
      );

      const res = await submissionPOST(req({ assignmentId: 1, completedCount: 5 }));
      expect(res.status).toBe(201);
      expect((await res.json()).autoApproved).toBe(role === "TeamLead");

      // Only the Team Lead's row is written Approved, and only their
      // delivered counter moves.
      expect(created.mock.calls[0][0].data.status).toBe(expected);
      expect(moved).toHaveBeenCalledTimes(role === "TeamLead" ? 1 : 0);
    }
  });

  it("a Team Lead can't approve their own submission", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    vi.mocked(prisma.domainTagSubmission.findUnique).mockResolvedValue({
      id: 1,
      status: "Pending",
      completedCount: 10,
      assignmentId: 1,
      assignment: {
        assignedCount: 100,
        deliveredCount: 0,
        // The reviewer is the assignee.
        assignee: { id: "u-TeamLead" },
      },
    } as never);
    const res = await reviewPATCH(req({ action: "approve" }), params("1"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/your own submission/i);
  });

  it("a Team Lead can review someone else's submission", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    vi.mocked(prisma.domainTagSubmission.findUnique).mockResolvedValue({
      id: 1,
      status: "Approved", // already decided: proves it got past both gates
      completedCount: 10,
      assignmentId: 1,
      assignment: {
        assignedCount: 100,
        deliveredCount: 0,
        assignee: { id: "someone-else" },
      },
    } as never);
    expect(
      (await reviewPATCH(req({ action: "approve" }), params("1"))).status,
    ).toBe(409);
  });

  it("tag assignment: 403 for an Actionee, allowed for a Team Lead", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    expect((await tagAssignPOST(req({ projectId: 1 }))).status).toBe(403);

    // A Team Lead may assign; it fails validation, not authorisation.
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    const res = await tagAssignPOST(req({}));
    expect(res.status).toBe(400);
  });

  it("allocations ?mine=true: a member reads their own, and only their own", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    vi.mocked(prisma.domainAllocation.findMany).mockResolvedValue([]);

    // The Lead-only gate is lifted for the self-scoped form...
    const res = await allocationsGET(getReq("http://test/x?mine=true"));
    expect(res.status).toBe(200);

    // ...and the filter is pinned to the caller.
    expect(vi.mocked(prisma.domainAllocation.findMany).mock.calls[0][0]).toMatchObject({
      where: { userId: "u-Actionee" },
    });
  });

  it("allocations ?mine=true ignores a userId pointing at someone else", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Actionee"));
    vi.mocked(prisma.domainAllocation.findMany).mockReset();
    vi.mocked(prisma.domainAllocation.findMany).mockResolvedValue([]);

    // mine=true must narrow to self, never widen to the requested user.
    await allocationsGET(getReq("http://test/x?mine=true&userId=someone-else"));
    expect(vi.mocked(prisma.domainAllocation.findMany).mock.calls[0][0]).toMatchObject({
      where: { userId: "u-Actionee" },
    });
  });

  it("approval: an SME can't sign off work", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("SME"));
    expect((await reviewPATCH(req({ action: "approve" }), params("1"))).status).toBe(403);
  });

  it("adding members: a Lead may add an Actionee but not an Admin or Lead", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Lead"));

    const asAdmin = await usersPOST(req({ name: "X", email: "x@y.com", password: "Passw0rd!23", role: "Admin" }));
    expect(asAdmin.status).toBe(403);

    const asLead = await usersPOST(req({ name: "X", email: "x@y.com", password: "Passw0rd!23", role: "Lead" }));
    expect(asLead.status).toBe(403);

    // The Actionee path gets past the gate and on to account creation.
    const { createDomainAccount } = await import("@/lib/domain-auth");
    vi.mocked(createDomainAccount).mockResolvedValue({ ok: false, error: "stub" });
    const asActionee = await usersPOST(req({ name: "X", email: "x@y.com", password: "Passw0rd!23", role: "Actionee" }));
    expect(asActionee.status).toBe(400);
  });

  it("a TeamLead can't add members at all", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("TeamLead"));
    expect((await usersPOST(req({ name: "X", email: "x@y.com", password: "Passw0rd!23" }))).status).toBe(403);
  });

  it("approving a submission that was already reviewed is a 409", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Lead"));
    vi.mocked(prisma.domainTagSubmission.findUnique).mockResolvedValue({
      id: 1,
      status: "Approved",
      completedCount: 70,
      assignmentId: 1,
      assignment: { assignedCount: 100, deliveredCount: 70, assignee: { id: "someone-else" } },
    } as never);
    expect((await reviewPATCH(req({ action: "approve" }), params("1"))).status).toBe(409);
  });

  it("a Lead can't approve more tags than were claimed", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Lead"));
    vi.mocked(prisma.domainTagSubmission.findUnique).mockResolvedValue({
      id: 1,
      status: "Pending",
      completedCount: 70,
      assignmentId: 1,
      assignment: { assignedCount: 100, deliveredCount: 0, assignee: { id: "someone-else" } },
    } as never);
    const res = await reviewPATCH(req({ action: "approve", approvedCount: 90 }), params("1"));
    expect(res.status).toBe(400);
  });

  it("a Lead can't approve past what's left on the assignment", async () => {
    vi.mocked(requireDomainUser).mockResolvedValue(actor("Lead"));
    vi.mocked(prisma.domainTagSubmission.findUnique).mockResolvedValue({
      id: 1,
      status: "Pending",
      completedCount: 50,
      assignmentId: 1,
      assignment: { assignedCount: 100, deliveredCount: 80, assignee: { id: "someone-else" } },
    } as never);
    const res = await reviewPATCH(req({ action: "approve", approvedCount: 50 }), params("1"));
    expect(res.status).toBe(400);
  });
});
