import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    performanceReview: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

// Real role gates; only the session lookup and audit write are faked.
vi.mock("@/lib/server-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server-access")>()),
  requireUser: vi.fn(),
  writeAudit: vi.fn(),
  notifyUser: vi.fn(),
}));

// The report itself is covered in performance-report.test.ts; here it's
// a small real one so the download really renders the Word template.
vi.mock("@/lib/performance/load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/performance/load")>()),
  findEmployee: vi.fn(),
  loadReport: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { notifyUser, requireUser } from "@/lib/server-access";
import { findEmployee, loadReport } from "@/lib/performance/load";
import { buildReport } from "@/lib/performance/report";
import { workingDaySet } from "@/lib/engagement";
import { accessRole } from "@/lib/role-access";
import { GET as GET_PEOPLE } from "@/app/api/performance/people/route";
import { PATCH as PATCH_PERSON } from "@/app/api/performance/people/[id]/route";
import { GET as GET_REPORT, PUT as PUT_REPORT } from "@/app/api/performance/report/route";
import { GET as DOWNLOAD } from "@/app/api/performance/report/download/route";
import { GET as GET_ME, PUT as PUT_ME } from "@/app/api/performance/me/route";
import type { SessionUser } from "@/lib/auth";
import type { Role } from "@/lib/role";

/** A session as lib/auth.ts builds it: HR's access role is Coordinator. */
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

const EMPLOYEE = {
  id: "emp-1",
  name: "Sanjana Shinde",
  employeeCode: "IBS-042",
  department: "Engineering",
  designation: "Developer",
  joined: null,
  capacityPerWeek: 40,
  reportingManagerId: "lead-rm",
  reportingManager: { name: "Rahul Lead" },
};

const REPORT = buildReport(
  {
    kind: "Monthly",
    period: "2026-09",
    today: "2026-10-06",
    employee: {
      id: "emp-1",
      name: "Sanjana Shinde",
      employeeCode: "IBS-042",
      department: "Engineering",
      designation: "Developer",
      joined: null,
      reportingManager: "Rahul Lead",
    },
    tasks: [],
    entries: [],
    leaves: [],
    remarks: 0,
    workDays: workingDaySet(["Mon", "Tue", "Wed", "Thu", "Fri"]),
    hoursPerDay: 8,
  },
  {},
);

const Q = "userId=emp-1&kind=Monthly&period=2026-09";
const get = (path: string) => new Request(`http://x${path}`);
const json = (method: string, body: unknown, path = "/api") =>
  new Request(`http://x${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  vi.mocked(notifyUser).mockReset();
  const p = vi.mocked(prisma, true);
  p.user.findMany.mockReset().mockResolvedValue([] as never);
  p.user.findUnique.mockReset();
  p.user.findFirst.mockReset().mockResolvedValue(null as never);
  p.user.update.mockReset().mockResolvedValue({} as never);
  p.performanceReview.findUnique.mockReset().mockResolvedValue(null as never);
  p.performanceReview.upsert.mockReset().mockResolvedValue({} as never);
  vi.mocked(findEmployee).mockReset().mockResolvedValue(EMPLOYEE as never);
  vi.mocked(loadReport)
    .mockReset()
    .mockResolvedValue({ report: REPORT, meta: { savedAt: null, savedBy: null } });
});

const OUTSIDERS = ["Developer", "BusinessDeveloper"] as const;
const VIEWERS = ["Admin", "Lead", "Coordinator", "HR"] as const;

describe("HR role", () => {
  it("has exactly the Co-ordinator's access", () => {
    expect(accessRole("HR")).toBe("Coordinator");
    expect(accessRole("Lead")).toBe("Lead");
  });
});

describe("GET /api/performance/people", () => {
  it("401s an anonymous caller", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({}, { status: 401 }));
    expect((await GET_PEOPLE()).status).toBe(401);
  });

  it.each(OUTSIDERS)("403s a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    expect((await GET_PEOPLE()).status).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it.each(VIEWERS)("lists people for a %s, with download only for HR", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    const res = await GET_PEOPLE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.viewer.canDownload).toBe(role === "HR");
    expect(body.viewer.canEditRecords).toBe(role === "HR" || role === "Admin");
  });
});

describe("GET /api/performance/report", () => {
  it.each(OUTSIDERS)("403s a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    expect((await GET_REPORT(get(`/api/performance/report?${Q}`))).status).toBe(403);
    expect(loadReport).not.toHaveBeenCalled();
  });

  it.each(VIEWERS)("shows the review to a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    const res = await GET_REPORT(get(`/api/performance/report?${Q}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.employee.name).toBe("Sanjana Shinde");
    expect(body.canDownload).toBe(role === "HR");
  });

  it("400s a bad period", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    const res = await GET_REPORT(get("/api/performance/report?userId=emp-1&kind=Monthly&period=2026"));
    expect(res.status).toBe(400);
  });

  it("only the Reporting Manager, HR or Admin can edit", async () => {
    const editable = async (u: SessionUser) => {
      vi.mocked(requireUser).mockResolvedValue(u);
      return (await (await GET_REPORT(get(`/api/performance/report?${Q}`))).json()).canEdit;
    };
    expect(await editable(actor("Lead", "lead-rm"))).toBe(true);
    expect(await editable(actor("HR"))).toBe(true);
    expect(await editable(actor("Admin"))).toBe(true);
    expect(await editable(actor("Lead", "other-lead"))).toBe(false);
    expect(await editable(actor("Coordinator"))).toBe(false);
  });
});

describe("PUT /api/performance/report", () => {
  const body = { userId: "emp-1", kind: "Monthly", period: "2026-09", changes: { "rating.quality.manager": "4" } };

  it.each([...OUTSIDERS, "Coordinator"] as const)("403s a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    expect((await PUT_REPORT(json("PUT", body))).status).toBe(403);
    expect(prisma.performanceReview.upsert).not.toHaveBeenCalled();
  });

  it("403s a Lead who isn't this person's Reporting Manager", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Lead", "other-lead"));
    expect((await PUT_REPORT(json("PUT", body))).status).toBe(403);
  });

  it.each([
    ["Reporting Manager", actor("Lead", "lead-rm")],
    ["HR", actor("HR")],
    ["Admin", actor("Admin")],
  ])("saves for the %s", async (_, u) => {
    vi.mocked(requireUser).mockResolvedValue(u);
    expect((await PUT_REPORT(json("PUT", body))).status).toBe(200);
    expect(vi.mocked(prisma.performanceReview.upsert).mock.calls[0][0].create.inputs).toBe(
      JSON.stringify({ "rating.quality.manager": "4" }),
    );
  });

  it("rejects unknown fields and out-of-range ratings", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    expect((await PUT_REPORT(json("PUT", { ...body, changes: { "user.isAdmin": "true" } }))).status).toBe(400);
    expect((await PUT_REPORT(json("PUT", { ...body, changes: { "rating.quality.manager": "7" } }))).status).toBe(400);
    expect(prisma.performanceReview.upsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/performance/report/download", () => {
  it.each([...OUTSIDERS, "Admin", "Lead", "Coordinator"] as const)("403s a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    expect((await DOWNLOAD(get(`/api/performance/report/download?${Q}`))).status).toBe(403);
    expect(loadReport).not.toHaveBeenCalled();
  });

  it("a Co-ordinator session can't pass as HR", async () => {
    // Same access role as HR, but not the HR account role.
    vi.mocked(requireUser).mockResolvedValue({ ...actor("Coordinator"), primaryRole: undefined });
    expect((await DOWNLOAD(get(`/api/performance/report/download?${Q}`))).status).toBe(403);
  });

  it("gives HR the filled Word document", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    const res = await DOWNLOAD(get(`/api/performance/report/download?${Q}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("wordprocessingml");
    expect(res.headers.get("Content-Disposition")).toContain(
      "Monthly_Performance_Review_Sanjana_Shinde_2026-09.docx",
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // a zip, i.e. a .docx
  });
});

describe("PATCH /api/performance/people/[id]", () => {
  it.each([...OUTSIDERS, "Lead", "Coordinator"] as const)("403s a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    const res = await PATCH_PERSON(json("PATCH", { department: "QA" }), params("emp-1"));
    expect(res.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("lets HR set details and a Lead as Reporting Manager", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("HR"));
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: "emp-1", name: "Sanjana" } as never)
      .mockResolvedValueOnce({ primaryRole: "Lead", isActive: true } as never);
    const res = await PATCH_PERSON(
      json("PATCH", { employeeCode: "IBS-042", department: "Engineering", reportingManagerId: "lead-rm", joined: "2024-06-01" }),
      params("emp-1"),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data).toMatchObject({
      employeeCode: "IBS-042",
      department: "Engineering",
      reportingManagerId: "lead-rm",
    });
  });

  it("rejects a Reporting Manager who isn't a Lead", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: "emp-1", name: "Sanjana" } as never)
      .mockResolvedValueOnce({ primaryRole: "Developer", isActive: true } as never);
    const res = await PATCH_PERSON(json("PATCH", { reportingManagerId: "dev-2" }), params("emp-1"));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/performance/report — merging", () => {
  it("keeps the employee's saved self-ratings when a reviewer saves", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Lead", "lead-rm"));
    vi.mocked(prisma.performanceReview.findUnique).mockResolvedValue({
      inputs: JSON.stringify({ "rating.quality.employee": "4", "self.challenges": "VPN" }),
    } as never);
    const res = await PUT_REPORT(
      json("PUT", {
        userId: "emp-1",
        kind: "Monthly",
        period: "2026-09",
        changes: { "rating.quality.manager": "3", "self.challenges": "" },
      }),
    );
    expect(res.status).toBe(200);
    const saved = JSON.parse(vi.mocked(prisma.performanceReview.upsert).mock.calls[0][0].update.inputs as string);
    // Untouched employee field survives; "" clears; new field added.
    expect(saved).toEqual({ "rating.quality.employee": "4", "rating.quality.manager": "3" });
  });
});

describe("/api/performance/me — My Performance", () => {
  const MQ = "kind=Monthly&period=2026-09";

  it.each(["Admin", "Lead", "BusinessDeveloper"] as const)("403s a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    expect((await GET_ME(get(`/api/performance/me?${MQ}`))).status).toBe(403);
    expect((await PUT_ME(json("PUT", { kind: "Monthly", period: "2026-09", changes: {} }))).status).toBe(403);
    expect(loadReport).not.toHaveBeenCalled();
  });

  it.each(["Developer", "Coordinator", "HR"] as const)("opens My Performance for a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role, `self-${role}`));
    expect((await GET_ME(get(`/api/performance/me?${MQ}`))).status).toBe(200);
    expect(vi.mocked(loadReport).mock.calls[0][0]).toBe(`self-${role}`);
  });

  it("shows a Developer their own review, never someone else's", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "dev-1"));
    const res = await GET_ME(get(`/api/performance/me?${MQ}&userId=emp-1`));
    expect(res.status).toBe(200);
    expect(vi.mocked(loadReport).mock.calls[0][0]).toBe("dev-1");
  });

  it("hides the manager's side from the employee", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "dev-1"));
    const body = await (await GET_ME(get(`/api/performance/me?${MQ}`))).json();
    expect(Object.keys(body.view.areas[0]).sort()).toEqual(["employee", "evidence", "key", "label"]);
    expect(body.view.manager).toBeUndefined();
    expect(body.view.summary).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/"manager"|"system"|"effective"/);
  });

  it("saves the employee's own fields, merged onto the review", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "dev-1"));
    vi.mocked(prisma.performanceReview.findUnique).mockResolvedValue({
      inputs: JSON.stringify({ "rating.quality.manager": "3" }),
    } as never);
    const changes = {
      "rating.quality.employee": "4",
      "self.achievements": "Shipped the ESP change spec",
      "summary.employeeComments": "Need a CAD licence",
      "summary.commentTo": "hr",
    };
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "hr-1", name: "Janvi" }] as never);
    const res = await PUT_ME(json("PUT", { kind: "Monthly", period: "2026-09", changes }));
    expect(res.status).toBe(200);
    const call = vi.mocked(prisma.performanceReview.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ userId_kind_period: { userId: "dev-1", kind: "Monthly", period: "2026-09" } });
    expect(JSON.parse(call.update.inputs as string)).toEqual({ "rating.quality.manager": "3", ...changes });
  });

  it.each([
    ["the manager's rating", { "rating.quality.manager": "5" }],
    ["manager comments", { "mgr.strengths": "great" }],
    ["the overall rating", { "summary.overall": "5" }],
    ["the performance level", { "summary.level": "Exceptional" }],
    ["an out-of-range self-rating", { "rating.quality.employee": "9" }],
  ])("rejects %s", async (_, changes) => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "dev-1"));
    const res = await PUT_ME(json("PUT", { kind: "Monthly", period: "2026-09", changes }));
    expect(res.status).toBe(400);
    expect(prisma.performanceReview.upsert).not.toHaveBeenCalled();
  });
});

describe("My Comments — Send to Reporting Manager or HR", () => {
  const put = (changes: Record<string, string>) =>
    PUT_ME(json("PUT", { kind: "Monthly", period: "2026-09", changes }, "http://x/api/performance/me"));

  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer", "emp-1"));
  });

  it("notifies the Reporting Manager when the comment is sent to them", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "lead-rm", name: "Rahul Lead", isActive: true } as never);
    const res = await put({ "summary.employeeComments": "Need a CAD licence", "summary.commentTo": "manager" });
    expect(res.status).toBe(200);
    expect((await res.json()).notified).toEqual(["Rahul Lead"]);
    expect(notifyUser).toHaveBeenCalledTimes(1);
    const [to, n] = vi.mocked(notifyUser).mock.calls[0];
    expect(to).toBe("lead-rm");
    expect(n).toMatchObject({ kind: "performance_comment", body: "Need a CAD licence" });
    expect(n.title).toContain("monthly review for September 2026");
  });

  it("notifies every active HR account when sent to HR", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "hr-1", name: "Janvi" },
      { id: "hr-2", name: "Hema" },
    ] as never);
    const res = await put({ "summary.employeeComments": "Leave balance query", "summary.commentTo": "hr" });
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.user.findMany).mock.calls[0][0]).toMatchObject({
      where: { primaryRole: "HR", isActive: true, NOT: { id: "emp-1" } },
    });
    expect(vi.mocked(notifyUser).mock.calls.map((c) => c[0])).toEqual(["hr-1", "hr-2"]);
  });

  it("refuses a comment with no recipient, and saves nothing", async () => {
    const res = await put({ "summary.employeeComments": "Hello" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Reporting Manager or HR/);
    expect(prisma.performanceReview.upsert).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("refuses 'Reporting Manager' when none is set", async () => {
    vi.mocked(findEmployee).mockResolvedValue({ ...EMPLOYEE, reportingManagerId: null } as never);
    const res = await put({ "summary.employeeComments": "Hello", "summary.commentTo": "manager" });
    expect(res.status).toBe(400);
    expect(prisma.performanceReview.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown recipient", async () => {
    const res = await put({ "summary.employeeComments": "Hello", "summary.commentTo": "ceo" });
    expect(res.status).toBe(400);
  });

  it("doesn't re-notify when only other fields change", async () => {
    vi.mocked(prisma.performanceReview.findUnique).mockResolvedValue({
      inputs: JSON.stringify({ "summary.employeeComments": "Sent already", "summary.commentTo": "hr" }),
    } as never);
    const res = await put({ "rating.quality.employee": "4" });
    expect(res.status).toBe(200);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});
