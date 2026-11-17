/**
 * /api/v1 guardrails for the PM Inventive service account: auth and the
 * kill switch, the writable-field whitelist, no deletes, no evaluation
 * data, validation, attribution and per-row bulk results.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

const tx = {
  task: { update: vi.fn(), create: vi.fn() },
  taskAssignee: { deleteMany: vi.fn(), create: vi.fn(), createMany: vi.fn() },
  taskHistory: { createMany: vi.fn(), create: vi.fn() },
  auditEntry: { create: vi.fn() },
  remark: { create: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    apiToken: { findUnique: vi.fn(), update: vi.fn(() => Promise.resolve()) },
    apiRequestLog: { create: vi.fn(() => Promise.resolve()) },
    apiIdempotency: { findUnique: vi.fn(), upsert: vi.fn(() => Promise.resolve()), deleteMany: vi.fn(() => Promise.resolve()) },
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
    task: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    sprint: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

vi.mock("@/lib/server-access", () => ({
  completedAtUpdate: (prev: string, next: string) =>
    next === "Done" && prev !== "Done" ? new Date("2026-10-14T05:00:00Z") : prev === "Done" && next !== "Done" ? null : undefined,
  isReopen: (prev: string, next: string) => prev === "Done" && next !== "Done",
  notifyUser: vi.fn(() => Promise.resolve()),
}));

import { prisma } from "@/lib/db";
import { hashApiToken } from "@/lib/api-v1/auth";
import { __resetRateLimits } from "@/lib/rate-limit";
import { GET as meGET } from "@/app/api/v1/auth/me/route";
import { GET as taskGET, PATCH as taskPATCH, DELETE as taskDELETE } from "@/app/api/v1/tasks/[id]/route";
import { POST as bulkPOST } from "@/app/api/v1/tasks/bulk-update/route";
import { GET as restGET } from "@/app/api/v1/[...rest]/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const TOKEN = "trk_" + "a".repeat(43);
const SERVICE = { id: "svc-1", name: "PM Inventive", email: "pm@x.com", isServiceAccount: true, isActive: true };

function tokenRow(over: Record<string, unknown> = {}, user: Record<string, unknown> = {}) {
  return { id: 7, revokedAt: null, tokenHash: hashApiToken(TOKEN), user: { ...SERVICE, ...user }, ...over };
}

function req(method: string, path: string, body?: unknown, token: string | null = TOKEN) {
  return new Request(`http://t/api/v1${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (params: Record<string, unknown>): any => ({ params: Promise.resolve(params) });

function taskRow(over: Record<string, unknown> = {}) {
  return {
    id: 101,
    title: "Login API",
    description: null,
    projectId: 3,
    project: { id: 3, key: "CRM" },
    sprintId: 52,
    parentId: null,
    priority: "High",
    status: "In Progress",
    startDate: null,
    targetDate: new Date("2026-10-20T00:00:00Z"),
    estimatedHours: 12,
    actualHours: null,
    progressPercent: 60,
    blockedReason: null,
    tags: "[]",
    completedAt: null,
    responsibleId: "u-lead",
    assignees: [{ userId: "u-ravi" }],
    timeEntries: [{ hours: 3 }, { hours: null }],
    blockedBy: [],
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-13T00:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  db.apiToken.findUnique.mockResolvedValue(tokenRow());
  db.project.findUnique.mockResolvedValue({ id: 3, name: "CRM Portal" });
  db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(
      where.id === "u-ravi"
        ? { id: "u-ravi", name: "Ravi Kumar", isActive: true, isServiceAccount: false }
        : null,
    ),
  );
  const ACTIVE = ["u-ravi", "u-asha"];
  db.user.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(where.id.in.filter((id) => ACTIVE.includes(id)).map((id) => ({ id }))),
  );
});

describe("auth", () => {
  it("rejects a missing token with 401", async () => {
    const res = await meGET(req("GET", "/auth/me", undefined, null), ctx({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("rejects an unknown token with 401", async () => {
    db.apiToken.findUnique.mockResolvedValue(null);
    expect((await meGET(req("GET", "/auth/me"), ctx({}))).status).toBe(401);
  });

  it("rejects a revoked token with 401", async () => {
    db.apiToken.findUnique.mockResolvedValue(tokenRow({ revokedAt: new Date() }));
    expect((await meGET(req("GET", "/auth/me"), ctx({}))).status).toBe(401);
  });

  it("kill switch: a disabled service account gets 401 account_disabled", async () => {
    db.apiToken.findUnique.mockResolvedValue(tokenRow({}, { isActive: false }));
    const res = await meGET(req("GET", "/auth/me"), ctx({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("account_disabled");
  });

  it("refuses tokens that belong to a person rather than a service account", async () => {
    db.apiToken.findUnique.mockResolvedValue(tokenRow({}, { isServiceAccount: false }));
    expect((await meGET(req("GET", "/auth/me"), ctx({}))).status).toBe(401);
  });

  it("returns the service account for a valid token", async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: "svc-1", name: "PM Inventive", email: "pm@x.com", primaryRole: "Developer",
      isActive: true, isServiceAccount: true, capacityPerWeek: 0,
    });
    const res = await meGET(req("GET", "/auth/me"), ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "svc-1", role: "Service Account", service_account: true });
  });

  it("does not rate-limit 60 requests in a minute", async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      id: "svc-1", name: "PM Inventive", email: "pm@x.com", primaryRole: "Developer",
      isActive: true, isServiceAccount: true, capacityPerWeek: 0,
    });
    for (let i = 0; i < 60; i++) {
      expect((await meGET(req("GET", "/auth/me"), ctx({}))).status).toBe(200);
    }
  });
});

describe("guardrails", () => {
  it("DELETE on a task is 403", async () => {
    const res = await taskDELETE(req("DELETE", "/tasks/101"), ctx({ id: "101" }));
    expect(res.status).toBe(403);
  });

  it("evaluation endpoints are 403, other unknown paths 404", async () => {
    expect((await restGET(req("GET", "/performance/u-ravi"), ctx({ rest: ["performance", "u-ravi"] }))).status).toBe(403);
    expect((await restGET(req("GET", "/users/u-ravi/ratings"), ctx({ rest: [] }))).status).toBe(403);
    expect((await restGET(req("GET", "/nothing-here"), ctx({ rest: ["nothing-here"] }))).status).toBe(404);
  });

  it("writing a non-writable field is 403 naming the field", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskPATCH(req("PATCH", "/tasks/101", { rating: 5 }), ctx({ id: "101" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatchObject({ code: "forbidden_field", field: "rating" });
    expect(tx.task.update).not.toHaveBeenCalled();
  });

  it("an invalid status is 422", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskPATCH(req("PATCH", "/tasks/101", { status: "Finished" }), ctx({ id: "101" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.field).toBe("status");
  });

  it("an over-long source_note is 422", async () => {
    const res = await taskPATCH(
      req("PATCH", "/tasks/101", { status: "Done", source_note: "x".repeat(501) }),
      ctx({ id: "101" }),
    );
    expect(res.status).toBe(422);
  });

  it("an unknown on_behalf_of_user_id is 422", async () => {
    const res = await taskPATCH(
      req("PATCH", "/tasks/101", { status: "Done", on_behalf_of_user_id: "nobody" }),
      ctx({ id: "101" }),
    );
    expect(res.status).toBe(422);
  });
});

describe("reads", () => {
  it("serializes a task with key, first assignee, logged hours and no evaluation fields", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskGET(req("GET", "/tasks/101"), ctx({ id: "101" }));
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t).toMatchObject({
      id: 101, key: "CRM-101", assignee_id: "u-ravi", assignee_ids: ["u-ravi"],
      due_date: "2026-10-20", logged_hours: 3, status: "In Progress", blocked: false,
    });
    expect(t).not.toHaveProperty("reopenCount");
    expect(t).not.toHaveProperty("important");
  });

  it("falls back to P<id> when the project has no key", async () => {
    db.task.findUnique.mockResolvedValue(taskRow({ project: { id: 3, key: null } }));
    const t = await (await taskGET(req("GET", "/tasks/101"), ctx({ id: "101" }))).json();
    expect(t.key).toBe("P3-101");
  });
});

describe("PATCH /tasks/{id}", () => {
  it("marks Done with attribution: history, audit entry, completedAt, progress 100", async () => {
    db.task.findUnique
      .mockResolvedValueOnce(taskRow())
      .mockResolvedValueOnce(taskRow({ status: "Done", progressPercent: 100, completedAt: new Date() }));
    const res = await taskPATCH(
      req("PATCH", "/tasks/101", {
        status: "done",
        source_note: "Teams standup reply from ravi@x.com",
        on_behalf_of_user_id: "u-ravi",
      }),
      ctx({ id: "101" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("Done");

    const update = tx.task.update.mock.calls[0][0];
    expect(update.data).toMatchObject({ status: "Done", progressPercent: 100 });
    expect(update.data.completedAt).toBeInstanceOf(Date);

    const rows = tx.taskHistory.createMany.mock.calls[0][0].data;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "status", oldValue: '"In Progress"', newValue: '"Done"',
          changedById: "svc-1", onBehalfOfUserId: "u-ravi", sourceNote: "Teams standup reply from ravi@x.com",
        }),
        expect.objectContaining({ field: "progress_percent", oldValue: "60", newValue: "100" }),
      ]),
    );
    const audit = tx.auditEntry.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ actorId: "svc-1", action: "task.status_change", scope: "CRM Portal" });
    expect(audit.after).toContain("via PM Inventive on behalf of Ravi Kumar: Teams standup reply");
  });

  it("is a no-op (no writes) when nothing changes", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskPATCH(req("PATCH", "/tasks/101", { status: "In Progress" }), ctx({ id: "101" }));
    expect(res.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocked=true sets status Blocked and posts the reason as a remark", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    await taskPATCH(
      req("PATCH", "/tasks/101", { blocked: true, blocked_reason: "Waiting on client" }),
      ctx({ id: "101" }),
    );
    expect(tx.task.update.mock.calls[0][0].data).toMatchObject({ status: "Blocked", blockedReason: "Waiting on client" });
    expect(tx.remark.create.mock.calls[0][0].data).toMatchObject({ authorId: "svc-1", body: "Blocked: Waiting on client" });
  });

  it("rejects a sprint from another project", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    db.sprint.findUnique.mockResolvedValue({ projectId: 99 });
    const res = await taskPATCH(req("PATCH", "/tasks/101", { sprint_id: 60 }), ctx({ id: "101" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.field).toBe("sprint_id");
  });

  it("rejects assigning to someone who isn't an active team member", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskPATCH(req("PATCH", "/tasks/101", { assignee_id: "ghost" }), ctx({ id: "101" }));
    expect(res.status).toBe(422);
  });

  it("assignee_id adds a person and keeps the existing assignees", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskPATCH(req("PATCH", "/tasks/101", { assignee_id: "u-asha" }), ctx({ id: "101" }));
    expect(res.status).toBe(200);
    expect(tx.taskAssignee.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 101, userId: { notIn: ["u-ravi", "u-asha"] } },
    });
    expect(tx.taskAssignee.createMany).toHaveBeenCalledWith({ data: [{ taskId: 101, userId: "u-asha" }] });
    expect(tx.taskHistory.createMany.mock.calls[0][0].data[0]).toMatchObject({
      field: "assignee_ids",
      oldValue: JSON.stringify(["u-ravi"]),
      newValue: JSON.stringify(["u-ravi", "u-asha"]),
    });
  });

  it("assignee_id for someone already on the task changes nothing", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskPATCH(req("PATCH", "/tasks/101", { assignee_id: "u-ravi" }), ctx({ id: "101" }));
    expect(res.status).toBe(200);
    expect(tx.task.update).not.toHaveBeenCalled();
    expect(tx.taskAssignee.createMany).not.toHaveBeenCalled();
  });

  it("remove_assignee_id takes one person off", async () => {
    db.task.findUnique.mockResolvedValue(taskRow({ assignees: [{ userId: "u-ravi" }, { userId: "u-asha" }] }));
    const res = await taskPATCH(req("PATCH", "/tasks/101", { remove_assignee_id: "u-ravi" }), ctx({ id: "101" }));
    expect(res.status).toBe(200);
    expect(tx.taskAssignee.deleteMany).toHaveBeenCalledWith({ where: { taskId: 101, userId: { notIn: ["u-asha"] } } });
    expect(tx.taskAssignee.createMany).not.toHaveBeenCalled();
  });

  it("assignee_id: null is 422 (use remove_assignee_id or assignee_ids)", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskPATCH(req("PATCH", "/tasks/101", { assignee_id: null }), ctx({ id: "101" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.field).toBe("assignee_id");
  });

  it("accepts Cancelled as a status (any case)", async () => {
    db.task.findUnique.mockResolvedValue(taskRow());
    const res = await taskPATCH(req("PATCH", "/tasks/101", { status: "cancelled" }), ctx({ id: "101" }));
    expect(res.status).toBe(200);
    expect(tx.task.update.mock.calls[0][0].data).toMatchObject({ status: "Cancelled" });
  });

  it("404s an unknown task", async () => {
    db.task.findUnique.mockResolvedValue(null);
    const res = await taskPATCH(req("PATCH", "/tasks/9999", { status: "Done" }), ctx({ id: "9999" }));
    expect(res.status).toBe(404);
  });
});

describe("POST /tasks/bulk-update", () => {
  it("reports a result per row so one bad row doesn't fail the batch", async () => {
    db.task.findUnique.mockImplementation(({ where }: { where: { id: number } }) =>
      Promise.resolve(where.id === 101 ? taskRow() : null),
    );
    const res = await bulkPOST(
      req("POST", "/tasks/bulk-update", {
        updates: [
          { id: 101, due_date: "2026-10-22" },
          { id: 102, due_date: "2026-10-23" },
          { id: 101, rating: 3 },
        ],
        source_note: "Friday sprint planning",
      }),
      ctx({}),
    );
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results[0]).toEqual({ id: 101, ok: true });
    expect(results[1]).toMatchObject({ id: 102, ok: false, code: "not_found" });
    expect(results[2]).toMatchObject({ id: 101, ok: false, code: "forbidden_field", field: "rating" });
    expect(tx.taskHistory.createMany.mock.calls[0][0].data[0]).toMatchObject({
      field: "due_date", newValue: '"2026-10-22"', sourceNote: "Friday sprint planning",
    });
  });

  it("replays a repeated Idempotency-Key without running again", async () => {
    db.apiIdempotency.findUnique.mockResolvedValue({
      method: "POST", path: "/api/v1/tasks/bulk-update", status: 200,
      response: '{"results":[{"id":101,"ok":true}]}', createdAt: new Date(),
    });
    const r = req("POST", "/tasks/bulk-update", { updates: [{ id: 101, due_date: "2026-10-22" }] });
    r.headers.set("idempotency-key", "abc");
    const res = await bulkPOST(r, ctx({}));
    expect(res.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await res.json()).toEqual({ results: [{ id: 101, ok: true }] });
    expect(db.task.findUnique).not.toHaveBeenCalled();
  });
});
