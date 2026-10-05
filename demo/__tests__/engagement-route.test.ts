import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    task: { findMany: vi.fn() },
    timeEntry: { groupBy: vi.fn() },
    leave: { findMany: vi.fn() },
    project: { findMany: vi.fn(), findUnique: vi.fn() },
    resourceForecast: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/settings", () => ({
  getSettingsParsed: vi.fn(async () => ({
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    workingHoursPerDay: 8,
  })),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

// Keep the real role gate under test — only the session lookup and the
// audit write are faked.
vi.mock("@/lib/server-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server-access")>()),
  requireUser: vi.fn(),
  writeAudit: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server-access";
import { GET } from "@/app/api/engagement/route";
import { PUT, DELETE } from "@/app/api/engagement/forecasts/route";
import { PATCH } from "@/app/api/engagement/track/route";
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

function json(method: string, body: unknown, url = "http://x/api") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FORECAST = {
  projectId: 7,
  track: "Plugin",
  startDate: "2026-10-05",
  targetDate: "2026-12-15",
  effortHours: 200,
  memberIds: ["dev-1"],
};

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  const p = vi.mocked(prisma, true);
  p.user.findMany.mockReset().mockResolvedValue([] as never);
  p.user.findUnique.mockReset();
  p.user.update.mockReset().mockResolvedValue({} as never);
  p.task.findMany.mockReset().mockResolvedValue([] as never);
  p.timeEntry.groupBy.mockReset().mockResolvedValue([] as never);
  p.leave.findMany.mockReset().mockResolvedValue([] as never);
  p.project.findMany.mockReset().mockResolvedValue([] as never);
  p.project.findUnique.mockReset();
  p.resourceForecast.findMany.mockReset().mockResolvedValue([] as never);
  p.resourceForecast.findUnique.mockReset();
  p.resourceForecast.upsert.mockReset().mockResolvedValue({} as never);
  p.resourceForecast.update.mockReset();
  p.resourceForecast.delete.mockReset();
});

const OUTSIDERS = ["Developer", "BusinessDeveloper"] as const;
const PLANNERS = ["Admin", "Lead", "Coordinator"] as const;

describe("GET /api/engagement", () => {
  it("401s an anonymous caller", async () => {
    vi.mocked(requireUser).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    expect((await GET()).status).toBe(401);
  });

  it.each(OUTSIDERS)("403s a %s and never queries", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    expect((await GET()).status).toBe(403);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });

  it.each(PLANNERS)("lets a %s see engagement org-wide", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "dev-1",
        name: "Prasad Kulkarni",
        primaryRole: "Developer",
        designation: "Engineer",
        track: "Plugin",
        capacityPerWeek: 40,
      },
    ] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.people).toEqual([
      expect.objectContaining({ id: "dev-1", track: "Plugin", hoursPerDay: 8 }),
    ]);
    // Not narrowed to the viewer's projects — no project-id filter.
    const where = vi.mocked(prisma.task.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).not.toHaveProperty("projectId");
  });
});

describe("PUT /api/engagement/forecasts", () => {
  it.each(OUTSIDERS)("403s a %s and writes nothing", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    expect((await PUT(json("PUT", FORECAST))).status).toBe(403);
    expect(prisma.resourceForecast.upsert).not.toHaveBeenCalled();
  });

  it.each(PLANNERS)("lets a %s save a forecast", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 7, name: "Alpha" } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "dev-1" }] as never);
    const res = await PUT(json("PUT", FORECAST));
    expect(res.status).toBe(200);
    expect(prisma.resourceForecast.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_track: { projectId: 7, track: "Plugin" } },
      }),
    );
  });

  it("rejects a track other than Application / Plugin", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    const res = await PUT(json("PUT", { ...FORECAST, track: "Mobile" }));
    expect(res.status).toBe(400);
  });

  it("409s when a ticked person is reserved in another forecast", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Lead"));
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 7, name: "Alpha" } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "dev-1" }] as never);
    vi.mocked(prisma.resourceForecast.findMany).mockResolvedValue([
      { memberIds: JSON.stringify(["dev-1"]) },
    ] as never);
    expect((await PUT(json("PUT", FORECAST))).status).toBe(409);
    expect(prisma.resourceForecast.upsert).not.toHaveBeenCalled();
  });

  it("doesn't count forecasts of Delivered projects as reservations", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 7, name: "Alpha" } as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "dev-1" }] as never);
    await PUT(json("PUT", FORECAST));
    const where = vi.mocked(prisma.resourceForecast.findMany).mock.calls[0][0]!.where;
    expect(where).toMatchObject({ project: { status: { not: "Delivered" } } });
  });
});

describe("DELETE /api/engagement/forecasts", () => {
  const url = "http://x/api/engagement/forecasts?projectId=7&track=Plugin";

  it.each(OUTSIDERS)("403s a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    expect((await DELETE(new Request(url, { method: "DELETE" }))).status).toBe(403);
    expect(prisma.resourceForecast.delete).not.toHaveBeenCalled();
  });

  it("releases one person without dropping the rest", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
    vi.mocked(prisma.resourceForecast.findUnique).mockResolvedValue({
      id: 3,
      memberIds: JSON.stringify(["dev-1", "dev-2"]),
      project: { name: "Alpha" },
    } as never);
    const res = await DELETE(new Request(url + "&userId=dev-1", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(prisma.resourceForecast.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { memberIds: JSON.stringify(["dev-2"]) },
    });
    expect(prisma.resourceForecast.delete).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/engagement/track", () => {
  it.each(OUTSIDERS)("403s a %s", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    const res = await PATCH(json("PATCH", { userId: "dev-1", track: "Application" }));
    expect(res.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each(PLANNERS)("lets a %s put a developer on a track", async (role) => {
    vi.mocked(requireUser).mockResolvedValue(actor(role));
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "dev-1",
      name: "Prasad",
      primaryRole: "Developer",
      track: null,
    } as never);
    const res = await PATCH(json("PATCH", { userId: "dev-1", track: "Application" }));
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "dev-1" },
      data: { track: "Application" },
    });
  });

  it("won't put a BD on a track", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Admin"));
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "bd-1",
      name: "Rohit",
      primaryRole: "BusinessDeveloper",
      track: null,
    } as never);
    const res = await PATCH(json("PATCH", { userId: "bd-1", track: "Plugin" }));
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
