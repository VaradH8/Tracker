import { describe, it, expect } from "vitest";
import {
  dailyTeamHours,
  hoursByClient,
  lastWorkWeekHours,
  openTasksByPerson,
  progressVsBudget,
  projectTimeline,
  projectsByStatus,
  projectsPastTarget,
  signInRecency,
  upcomingLeave,
  usersByRole,
  utilization,
  type HourDay,
} from "@/lib/dashboard-metrics";
import type { Account } from "@/lib/account-store";
import type { Client, LeaveEntry, Project, Task } from "@/lib/mock";

// Thursday 17 Sep 2026.
const TODAY = "2026-09-17";

function project(id: number, extra: Partial<Project> = {}): Project {
  return {
    id, name: `P${id}`, clientId: 1, status: "Active", leads: [], coordinators: [],
    developers: [], bds: [], startDate: "2026-08-01", targetDate: "2026-10-30",
    budgetHours: 100, loggedHours: 50, progress: 0, health: "green", ...extra,
  };
}

function task(id: number, extra: Partial<Task> = {}): Task {
  return {
    id, title: `T${id}`, projectId: 1, priority: "Medium", status: "To Do",
    responsible: "Manasi", assignees: ["Adil"], targetDate: null, estimatedHours: 4,
    important: false, ...extra,
  };
}

function account(name: string, extra: Partial<Account> = {}): Account {
  return {
    id: `u-${name.toLowerCase().replace(/\s+/g, "-")}`, name, email: `${name}@x.com`,
    role: "Developer", active: true, capacityPerWeek: 40, ...extra,
  };
}

describe("projects", () => {
  const projects = [
    project(1, { status: "Active", targetDate: "2026-09-10" }),
    project(2, { status: "Discovery", targetDate: "2026-11-01", budgetHours: 0 }),
    project(3, { status: "Delivered", targetDate: "2026-08-01" }),
    project(4, { status: "Active", targetDate: "2026-10-01", loggedHours: 90, clientId: 2 }),
  ];

  it("counts projects by status in a fixed order", () => {
    expect(projectsByStatus(projects).map((r) => [r.status, r.count])).toEqual([
      ["Discovery", 1], ["Active", 2], ["On Hold", 0], ["Delivered", 1],
    ]);
  });

  it("flags undelivered projects past their target", () => {
    expect(projectsPastTarget(projects, TODAY).map((p) => p.id)).toEqual([1]);
  });

  it("puts projects burning budget faster than progress first", () => {
    const rows = progressVsBudget(projects, [
      task(1, { projectId: 4, status: "Done" }),
      task(2, { projectId: 4 }),
      task(3, { projectId: 1, status: "Done" }),
    ]);
    expect(rows.map((r) => [r.projectId, r.progress, r.budgetUsed])).toEqual([
      [4, 0.5, 0.9],
      [1, 1, 0.5],
      [2, 0, null],
    ]);
  });

  it("builds a timeline of undelivered projects with days left or late", () => {
    const rows = projectTimeline(projects, TODAY);
    expect(rows.map((r) => [r.projectId, r.daysLate, r.daysLeft])).toEqual([
      [1, 7, 0],
      [4, 0, 14],
      [2, 0, 45],
    ]);
  });

  it("sums logged hours per client", () => {
    const clients: Client[] = [
      { id: 1, name: "Saipem", industry: "", primaryContact: "", email: "", since: "" },
      { id: 2, name: "Thermax", industry: "", primaryContact: "", email: "", since: "" },
    ];
    expect(hoursByClient(projects, clients)).toEqual([
      { clientId: 1, client: "Saipem", hours: 150, projects: 3 },
      { clientId: 2, client: "Thermax", hours: 90, projects: 1 },
    ]);
  });
});

describe("resources", () => {
  const days: HourDay[] = [
    { userId: "u-adil-khan", date: "2026-09-17", hours: 6 },
    { userId: "u-adil-khan", date: "2026-09-13", hours: 5 }, // Sunday — ignored
    { userId: "u-adil-khan", date: "2026-09-11", hours: 7 },
    { userId: "u-adil-khan", date: "2026-09-10", hours: 8 }, // 7 days ago — outside
    { userId: "u-sanjana", date: "2026-09-16", hours: 4.5 },
  ];

  it("counts the last working week, weekdays only", () => {
    expect(lastWorkWeekHours(days, "u-adil-khan", TODAY)).toBe(13);
  });

  it("ranks active non-admin people by utilization", () => {
    const rows = utilization(
      [
        account("Adil Khan"),
        account("Sanjana", { capacityPerWeek: 20 }),
        account("Varad", { role: "Admin", isAdmin: true }),
        account("Gone", { active: false }),
      ],
      days,
      TODAY,
    );
    expect(rows.map((r) => [r.name, r.hours, r.capacity])).toEqual([
      ["Adil", 13, 40],
      ["Sanjana", 4.5, 20],
    ]);
  });

  it("totals team hours per weekday", () => {
    const rows = dailyTeamHours(days, TODAY, 7);
    expect(rows.map((r) => [r.date, r.hours])).toEqual([
      ["2026-09-11", 7], ["2026-09-14", 0], ["2026-09-15", 0], ["2026-09-16", 4.5], ["2026-09-17", 6],
    ]);
  });

  it("splits each person's open tasks into on time and overdue", () => {
    const rows = openTasksByPerson(
      [account("Adil Khan"), account("Sanjana"), account("Kiran")],
      [
        task(1, { assignees: ["Adil"] }),
        task(2, { assignees: ["Adil", "Sanjana"], overdueDays: 3 }),
        task(3, { assignees: ["Sanjana"], status: "Done" }),
      ],
    );
    expect(rows).toEqual([
      { name: "Adil", onTime: 1, overdue: 1 },
      { name: "Sanjana", onTime: 0, overdue: 1 },
    ]);
  });

  it("maps leave onto the next working days", () => {
    const { days: d, rows } = upcomingLeave(
      [
        { id: 1, resourceName: "Adil Khan", start: "2026-09-21", end: "2026-09-22", type: "Paid", approved: true },
        { id: 2, resourceName: "Kiran Patil", start: "2026-09-18", end: "2026-09-18", type: "Sick", approved: false },
        { id: 3, resourceName: "Old Leave", start: "2026-05-01", end: "2026-05-02", type: "Paid", approved: true },
      ] as LeaveEntry[],
      TODAY,
      4,
    );
    expect(d).toEqual(["2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22"]);
    expect(rows.map((r) => [r.name, r.cells])).toEqual([
      ["Kiran", [null, "pending", null, null]],
      ["Adil", [null, null, "approved", "approved"]],
    ]);
  });
});

describe("users", () => {
  it("counts active and deactivated users per role", () => {
    const rows = usersByRole([
      account("A", { role: "Admin" }),
      account("B"),
      account("C", { active: false }),
      account("D", { role: "Coordinator" }),
    ]);
    expect(rows.map((r) => [r.role, r.active, r.inactive])).toEqual([
      ["Admin", 1, 0], ["Lead", 0, 0], ["Coordinator", 1, 0], ["BusinessDeveloper", 0, 0], ["Developer", 1, 1],
    ]);
  });

  it("buckets active users by last sign-in", () => {
    const now = new Date(2026, 8, 17, 15, 0); // local 17 Sep, 3pm
    const at = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0).toISOString();
    const rows = signInRecency(
      [
        account("A", { lastLogin: at(2026, 8, 17) }),
        account("B", { lastLogin: at(2026, 8, 12) }),
        account("C", { lastLogin: at(2026, 8, 1) }),
        account("D", { lastLogin: at(2026, 5, 1) }),
        account("E", { lastLogin: null }),
        account("F", { lastLogin: null, active: false }),
      ],
      now,
    );
    expect(rows.map((r) => r.count)).toEqual([1, 1, 1, 1, 1]);
  });
});
