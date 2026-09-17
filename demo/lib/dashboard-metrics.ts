import type { Account } from "./account-store";
import type { Client, LeaveEntry, Project, ProjectStatus, Task } from "./mock";
import type { Role } from "./role";

/**
 * Numbers behind the Admin dashboard, grouped the way the app is: Projects,
 * Resources and Users. Pure functions over the client-side stores so the
 * page and its tests share one implementation. Dates are "YYYY-MM-DD".
 */

/** One person's logged hours for one day. */
export type HourDay = { userId: string; date: string; hours: number };

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayNum(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

export function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

/** "17 Sep" */
export function shortDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Thu 17" */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export const PROJECT_STATUSES: ProjectStatus[] = ["Discovery", "Active", "On Hold", "Delivered"];

export function projectsByStatus(projects: Project[]) {
  return PROJECT_STATUSES.map((status) => ({
    status,
    count: projects.filter((p) => p.status === status).length,
  }));
}

/** Not delivered and already past the target date. */
export function projectsPastTarget(projects: Project[], today: string): Project[] {
  return projects.filter((p) => p.status !== "Delivered" && p.targetDate < today);
}

export type ProgressRow = {
  projectId: number;
  name: string;
  /** Share of the project's tasks that are Done, 0–1. */
  progress: number;
  /** Logged / budgeted hours, or null without a budget. */
  budgetUsed: number | null;
  done: number;
  total: number;
};

/** Progress against budget for every project not yet delivered — the
 *  projects burning budget faster than they finish work come first. */
export function progressVsBudget(projects: Project[], tasks: Task[]): ProgressRow[] {
  return projects
    .filter((p) => p.status !== "Delivered")
    .map((p) => {
      const own = tasks.filter((t) => t.projectId === p.id);
      const done = own.filter((t) => t.status === "Done").length;
      return {
        projectId: p.id,
        name: p.name,
        progress: own.length ? done / own.length : 0,
        budgetUsed: p.budgetHours > 0 ? p.loggedHours / p.budgetHours : null,
        done,
        total: own.length,
      };
    })
    .sort((a, b) => {
      const gap = (r: ProgressRow) => (r.budgetUsed === null ? -Infinity : r.budgetUsed - r.progress);
      return gap(b) - gap(a) || a.name.localeCompare(b.name);
    });
}

export type TimelineRow = {
  projectId: number;
  name: string;
  status: ProjectStatus;
  start: string;
  target: string;
  /** Calendar days past the target (0 when not late). */
  daysLate: number;
  /** Calendar days until the target (0 when it has passed). */
  daysLeft: number;
};

/** Start → target for every project not yet delivered, soonest target first. */
export function projectTimeline(projects: Project[], today: string): TimelineRow[] {
  const t = dayNum(today);
  return projects
    .filter((p) => p.status !== "Delivered")
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      status: p.status,
      start: p.startDate,
      target: p.targetDate,
      daysLate: Math.max(0, t - dayNum(p.targetDate)),
      daysLeft: Math.max(0, dayNum(p.targetDate) - t),
    }))
    .sort((a, b) => a.target.localeCompare(b.target));
}

/** Logged project hours summed per client, biggest first. */
export function hoursByClient(projects: Project[], clients: Client[]) {
  const byClient = new Map<number, { hours: number; projects: number }>();
  for (const p of projects) {
    const cur = byClient.get(p.clientId) ?? { hours: 0, projects: 0 };
    cur.hours += p.loggedHours;
    cur.projects += 1;
    byClient.set(p.clientId, cur);
  }
  return Array.from(byClient.entries())
    .map(([clientId, v]) => ({
      clientId,
      client: clients.find((c) => c.id === clientId)?.name ?? "—",
      hours: v.hours,
      projects: v.projects,
    }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours);
}

/* ------------------------------------------------------------------ */
/* Resources                                                           */
/* ------------------------------------------------------------------ */

/** People who do the work: active, not admin accounts. */
export function workforce(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.active && !a.isAdmin && a.role !== "Admin");
}

/** Hours logged over the last working week — the past 7 calendar days,
 *  weekdays only. */
export function lastWorkWeekHours(days: HourDay[], userId: string, today: string): number {
  const t = dayNum(today);
  return round1(
    days
      .filter((d) => d.userId === userId)
      .filter((d) => {
        const ago = t - dayNum(d.date);
        const wd = weekdayOf(d.date);
        return ago >= 0 && ago < 7 && wd >= 1 && wd <= 5;
      })
      .reduce((s, d) => s + d.hours, 0),
  );
}

export type UtilRow = { id: string; name: string; hours: number; capacity: number; ratio: number };

/** Hours over the last working week against weekly capacity, busiest first. */
export function utilization(accounts: Account[], days: HourDay[], today: string): UtilRow[] {
  return workforce(accounts)
    .map((a) => {
      const hours = lastWorkWeekHours(days, a.id, today);
      const capacity = a.capacityPerWeek ?? 40;
      return { id: a.id, name: firstName(a.name), hours, capacity, ratio: capacity > 0 ? hours / capacity : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio || a.name.localeCompare(b.name));
}

/** Team hours per weekday over the last `n` calendar days, oldest first. */
export function dailyTeamHours(days: HourDay[], today: string, n = 30) {
  const t = dayNum(today);
  const out: { date: string; hours: number }[] = [];
  for (let d = t - n + 1; d <= t; d++) {
    const iso = isoOf(d);
    const wd = weekdayOf(iso);
    if (wd === 0 || wd === 6) continue;
    out.push({ date: iso, hours: round1(days.filter((x) => x.date === iso).reduce((s, x) => s + x.hours, 0)) });
  }
  return out;
}

export type WorkloadRow = { name: string; onTime: number; overdue: number };

/** Open tasks per active person, split into on-time and overdue. */
export function openTasksByPerson(accounts: Account[], tasks: Task[]): WorkloadRow[] {
  return accounts
    .filter((a) => a.active)
    .map((a) => {
      const first = firstName(a.name);
      const open = tasks.filter((t) => t.status !== "Done" && t.assignees.includes(first));
      const overdue = open.filter((t) => (t.overdueDays ?? 0) > 0).length;
      return { name: first, onTime: open.length - overdue, overdue };
    })
    .filter((r) => r.onTime + r.overdue > 0)
    .sort((a, b) => b.onTime + b.overdue - (a.onTime + a.overdue) || b.overdue - a.overdue);
}

export type LeaveCell = "approved" | "pending" | null;

/** Who is off over the next `n` working days (Mon–Fri). */
export function upcomingLeave(leaves: LeaveEntry[], today: string, n = 10) {
  const days: string[] = [];
  for (let d = dayNum(today); days.length < n; d++) {
    const wd = weekdayOf(isoOf(d));
    if (wd >= 1 && wd <= 5) days.push(isoOf(d));
  }
  const byPerson = new Map<string, LeaveCell[]>();
  for (const l of leaves) {
    const cells = byPerson.get(l.resourceName) ?? days.map(() => null as LeaveCell);
    days.forEach((d, i) => {
      if (d >= l.start && d <= l.end) {
        // An approved day wins over a pending request for the same day.
        cells[i] = cells[i] === "approved" ? "approved" : l.approved ? "approved" : "pending";
      }
    });
    byPerson.set(l.resourceName, cells);
  }
  const rows = Array.from(byPerson.entries())
    .filter(([, cells]) => cells.some(Boolean))
    .map(([name, cells]) => ({ name: firstName(name), fullName: name, cells }))
    .sort((a, b) => a.cells.findIndex(Boolean) - b.cells.findIndex(Boolean) || a.name.localeCompare(b.name));
  return { days, rows };
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export const ROLE_ORDER: Role[] = ["Admin", "Lead", "Coordinator", "BusinessDeveloper", "Developer"];

export function usersByRole(accounts: Account[]) {
  return ROLE_ORDER.map((role) => {
    const mine = accounts.filter((a) => a.role === role);
    return {
      role,
      active: mine.filter((a) => a.active).length,
      inactive: mine.filter((a) => !a.active).length,
    };
  });
}

export const SIGN_IN_BUCKETS = ["Today", "1–7 days ago", "8–30 days ago", "30+ days ago", "Never"] as const;

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** How recently each active user last signed in (by local calendar day). */
export function signInRecency(accounts: Account[], now: Date) {
  const today = dayNum(localIso(now));
  const counts = SIGN_IN_BUCKETS.map(() => 0);
  for (const a of accounts.filter((x) => x.active)) {
    if (!a.lastLogin) {
      counts[4]++;
      continue;
    }
    const ago = today - dayNum(localIso(new Date(a.lastLogin)));
    counts[ago <= 0 ? 0 : ago <= 7 ? 1 : ago <= 30 ? 2 : 3]++;
  }
  return SIGN_IN_BUCKETS.map((label, i) => ({ label, count: counts[i] }));
}
