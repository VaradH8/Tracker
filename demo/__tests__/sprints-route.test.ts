/**
 * /api/sprints (the Sprints page): a Developer, or anyone who doesn't run
 * the project, gets 403 on every write; the project's manager can create,
 * start/close and move tasks in, and only tasks of the sprint's project.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionUser } from "@/lib/auth";

const tx = { sprint: { create: vi.fn(), update: vi.fn() }, auditEntry: { create: vi.fn() } };

vi.mock("@/lib/db", () => ({
  prisma: {
    sprint: { findUnique: vi.fn(), findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    task: { count: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
    ),
  },
}));

const manages = vi.fn();
vi.mock("@/lib/server-access", () => ({
  requireUser: vi.fn(),
  visibleProjectIds: vi.fn(async () => "all"),
  canManageProjectTasks: (...a: unknown[]) => manages(...a),
  writeAudit: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => null, delete: () => null }),
}));

import { prisma } from "@/lib/db";
import { requireUser, writeAudit } from "@/lib/server-access";
import { GET, POST } from "@/app/api/sprints/route";
import { PATCH, DELETE } from "@/app/api/sprints/[id]/route";
import { GET as tasksGET, POST as tasksPOST } from "@/app/api/sprints/[id]/tasks/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function actor(role: SessionUser["role"]): SessionUser {
  return { id: `u-${role}`, email: `${role}@x.com`, name: role, role, isAdmin: role === "Admin" };
}
const req = (body?: unknown) =>
  new Request("http://t/api/sprints", {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const ROW = {
  id: 9,
  projectId: 3,
  project: { id: 3, name: "CRM Portal", key: "CRM" },
  name: "Week 47",
  goal: null,
  startDate: new Date("2026-11-16T00:00:00Z"),
  endDate: new Date("2026-11-20T00:00:00Z"),
  status: "planned",
  createdAt: new Date(),
  updatedAt: new Date(),
  tasks: [
    { id: 1, title: "A", status: "Done", priority: "High", estimatedHours: 4, targetDate: null, assignees: [] },
    { id: 2, title: "B", status: "In Progress", priority: "Low", estimatedHours: 6, targetDate: null, assignees: [] },
    { id: 3, title: "C", status: "Cancelled", priority: "Low", estimatedHours: 10, targetDate: null, assignees: [] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.sprint.findUnique.mockResolvedValue({ ...ROW, project: { ...ROW.project } });
  db.sprint.findMany.mockResolvedValue([ROW]);
  db.project.findUnique.mockResolvedValue({ name: "CRM Portal" });
  db.task.updateMany.mockResolvedValue({ count: 1 });
  tx.sprint.create.mockResolvedValue({ ...ROW, tasks: [] });
  tx.sprint.update.mockResolvedValue({ ...ROW, status: "active", tasks: [] });
});

describe("/api/sprints permissions", () => {
  for (const role of ["Developer", "BusinessDeveloper", "Lead"] as const) {
    it(`${role} who doesn't run the project gets 403 on every write`, async () => {
      vi.mocked(requireUser).mockResolvedValue(actor(role));
      manages.mockResolvedValue(false);
      const body = { projectId: 3, name: "W", startDate: "2026-11-23", endDate: "2026-11-27" };
      expect((await POST(req(body))).status).toBe(403);
      expect((await PATCH(req({ status: "active" }), ctx("9"))).status).toBe(403);
      expect((await tasksPOST(req({ add: [2] }), ctx("9"))).status).toBe(403);
      expect((await tasksGET(req(), ctx("9"))).status).toBe(403);
      expect(tx.sprint.create).not.toHaveBeenCalled();
      expect(tx.sprint.update).not.toHaveBeenCalled();
      expect(db.task.updateMany).not.toHaveBeenCalled();
    });
  }

  it("anyone signed in can list; counts leave Cancelled tasks out of the plan", async () => {
    vi.mocked(requireUser).mockResolvedValue(actor("Developer"));
    manages.mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const [s] = (await res.json()).sprints;
    expect(s).toMatchObject({ plannedTasks: 2, doneTasks: 1, plannedHours: 10, doneHours: 4, canManage: false });
    expect(s.tasks.map((t: { key: string }) => t.key)).toEqual(["CRM-1", "CRM-2", "CRM-3"]);
  });

  it("sprints can't be deleted", () => {
    expect(DELETE().status).toBe(405);
  });
});

describe("/api/sprints as the project's manager", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue(actor("Coordinator"));
    manages.mockResolvedValue(true);
  });

  it("creates a sprint and audits it without a 'via' suffix", async () => {
    const res = await POST(req({ projectId: 3, name: "Week 48", startDate: "2026-11-23", endDate: "2026-11-27" }));
    expect(res.status).toBe(201);
    expect(tx.sprint.create.mock.calls[0][0].data).toMatchObject({ projectId: 3, name: "Week 48", status: "planned" });
    expect(tx.auditEntry.create.mock.calls[0][0].data.after).toBe("Week 47 (planned)");
  });

  it("rejects an end date before the start date", async () => {
    const res = await POST(req({ projectId: 3, name: "W", startDate: "2026-11-27", endDate: "2026-11-23" }));
    expect(res.status).toBe(422);
  });

  it("starts a sprint", async () => {
    const res = await PATCH(req({ status: "active" }), ctx("9"));
    expect(res.status).toBe(200);
    expect(tx.sprint.update.mock.calls[0][0].data).toEqual({ status: "active" });
  });

  it("won't pull in tasks from another project", async () => {
    db.task.count.mockResolvedValue(1);
    const res = await tasksPOST(req({ add: [77] }), ctx("9"));
    expect(res.status).toBe(400);
    expect(db.task.updateMany).not.toHaveBeenCalled();
  });

  it("moves tasks in and out, and audits it", async () => {
    db.task.count.mockResolvedValue(0);
    const res = await tasksPOST(req({ add: [2], remove: [1] }), ctx("9"));
    expect(res.status).toBe(200);
    expect(db.task.updateMany).toHaveBeenCalledWith({ where: { id: { in: [2] }, projectId: 3 }, data: { sprintId: 9 } });
    expect(db.task.updateMany).toHaveBeenCalledWith({ where: { id: { in: [1] }, sprintId: 9 }, data: { sprintId: null } });
    expect(vi.mocked(writeAudit)).toHaveBeenCalledWith("u-Coordinator", "sprint.tasks", expect.anything());
  });
});
