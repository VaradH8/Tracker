/**
 * POST /api/v1/projects: the service account may create a project only on
 * behalf of a person who could create it in the UI, under an existing
 * client, and the person becomes its Lead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

const tx = {
  project: { create: vi.fn() },
  auditEntry: { create: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    apiToken: { findUnique: vi.fn(), update: vi.fn(() => Promise.resolve()) },
    apiRequestLog: { create: vi.fn(() => Promise.resolve()) },
    apiIdempotency: { findUnique: vi.fn(), upsert: vi.fn(() => Promise.resolve()), deleteMany: vi.fn(() => Promise.resolve()) },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    client: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));

import { prisma } from "@/lib/db";
import { hashApiToken } from "@/lib/api-v1/auth";
import { __resetRateLimits } from "@/lib/rate-limit";
import { POST, DELETE } from "@/app/api/v1/projects/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const TOKEN = "trk_" + "b".repeat(43);
const SERVICE = { id: "svc-1", name: "PM Inventive", email: "pm@x.com", isServiceAccount: true, isActive: true };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = { params: Promise.resolve({}) };

const PEOPLE: Record<string, Record<string, unknown>> = {
  "u-lead": { id: "u-lead", name: "Vishal", primaryRole: "Lead", isAdmin: false, isActive: true, isServiceAccount: false },
  "u-dev": { id: "u-dev", name: "Ravi", primaryRole: "Developer", isAdmin: false, isActive: true, isServiceAccount: false },
};

function post(body: unknown) {
  return POST(
    new Request("http://t/api/v1/projects", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx,
  );
}

const VALID = {
  name: "Boiler Retrofit",
  key: "BR",
  client: "thermax",
  target_end_date: "2027-03-15",
  member_ids: ["u-dev"],
  on_behalf_of_user_id: "u-lead",
  source_note: "Vishal asked in Teams",
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  db.apiToken.findUnique.mockResolvedValue({ id: 9, revokedAt: null, tokenHash: hashApiToken(TOKEN), user: SERVICE });
  db.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(PEOPLE[where.id] ?? null));
  db.user.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(where.id.in.filter((id) => PEOPLE[id]).map((id) => ({ id }))),
  );
  db.project.findUnique.mockResolvedValue(null);
  db.client.findFirst.mockResolvedValue({ id: 4 });
  tx.project.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 90,
      ...data,
      client: { name: "Thermax" },
      members: (data.members as { create: { userId: string }[] }).create,
    }),
  );
});

describe("POST /projects", () => {
  it("creates the project with the requester as Lead and an audit entry", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: 90, key: "BR", name: "Boiler Retrofit", client: "Thermax", target_end_date: "2027-03-15" });
    expect(body.member_ids).toEqual(["u-lead", "u-dev"]);
    const data = tx.project.create.mock.calls[0][0].data;
    expect(data.members.create).toEqual([
      { userId: "u-lead", role: "Lead" },
      { userId: "u-dev", role: "Developer" },
    ]);
    expect(data.clientId).toBe(4);
    expect(tx.auditEntry.create.mock.calls[0][0].data).toMatchObject({
      actorId: "svc-1",
      action: "project.create",
      after: expect.stringContaining("on behalf of Vishal: Vishal asked in Teams"),
    });
  });

  it("refuses a request on behalf of someone who can't create projects", async () => {
    const res = await post({ ...VALID, on_behalf_of_user_id: "u-dev" });
    expect(res.status).toBe(403);
    expect(tx.project.create).not.toHaveBeenCalled();
  });

  it("refuses a request on behalf of nobody", async () => {
    const { on_behalf_of_user_id: _omit, ...body } = VALID;
    const res = await post(body);
    expect(res.status).toBe(422);
    expect((await res.json()).error.field).toBe("on_behalf_of_user_id");
  });

  it("refuses an unknown client, a taken key and unknown members", async () => {
    db.client.findFirst.mockResolvedValueOnce(null);
    expect((await (await post(VALID)).json()).error.field).toBe("client");
    db.project.findUnique.mockResolvedValueOnce({ id: 3 });
    expect((await post(VALID)).status).toBe(409);
    const res = await post({ ...VALID, member_ids: ["u-ghost"] });
    expect(res.status).toBe(422);
    expect((await res.json()).error.field).toBe("member_ids");
    expect(tx.project.create).not.toHaveBeenCalled();
  });

  it("refuses fields outside the whitelist and a missing target date", async () => {
    expect((await post({ ...VALID, health: "red" })).status).toBe(403);
    const { target_end_date: _t, ...noDate } = VALID;
    expect((await post(noDate)).status).toBe(422);
  });

  it("still forbids deletes", async () => {
    const res = await DELETE(new Request("http://t/api/v1/projects", {
      method: "DELETE", headers: { authorization: `Bearer ${TOKEN}` },
    }), ctx);
    expect(res.status).toBe(403);
  });
});
