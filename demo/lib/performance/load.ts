/**
 * Performance review report — the database half. Gathers one employee's
 * facts for a period and hands them to buildReport() (lib/performance/
 * report.ts). Server-only.
 */

import { prisma } from "@/lib/db";
import { getSettingsParsed } from "@/lib/settings";
import { toISO, workingDaySet } from "@/lib/engagement";
import { REVIEWED_BY, mergeInputs, parseRating, type ReviewKind } from "./forms";
import {
  buildReport,
  completionDay,
  periodRange,
  type Inputs,
  type MonthlyRatings,
  type Report,
} from "./report";

const day = (d: Date | null) => (d ? toISO(d) : null);
const endOf = (iso: string) => new Date(iso + "T23:59:59.999Z");
const startOf = (iso: string) => new Date(iso + "T00:00:00.000Z");

export function parseInputs(json: string | null | undefined): Inputs {
  try {
    const v = JSON.parse(json ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Inputs = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

/** The employee as the review needs them, or null if there's no such
 *  user. Includes the reporting line for the edit-permission check. */
export async function findEmployee(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      department: true,
      designation: true,
      joined: true,
      capacityPerWeek: true,
      reportingManagerId: true,
      reportingManager: { select: { name: true } },
    },
  });
}

/** The active HR accounts' names, for the review's Sign-Off. */
export async function activeHrNames(): Promise<string> {
  const hr = await prisma.user.findMany({
    where: { primaryRole: "HR", isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return hr.map((u) => u.name).join(", ");
}

export type ReviewMeta = { savedAt: string | null; savedBy: string | null };

export type SaveResult =
  | { ok: true; previous: Inputs; next: Inputs }
  | { ok: false; error: string };

/** Merge validated changes into the saved review (creating it if needed).
 *  `check` sees the before/after inputs and can veto the save with an
 *  error message. */
export async function saveReviewChanges(
  employeeId: string,
  kind: ReviewKind,
  period: string,
  changes: Record<string, string>,
  actorId: string,
  check?: (previous: Inputs, next: Inputs) => string | null | Promise<string | null>,
): Promise<SaveResult> {
  const where = { userId_kind_period: { userId: employeeId, kind, period } };
  const existing = await prisma.performanceReview.findUnique({ where, select: { inputs: true } });
  const saved = parseInputs(existing?.inputs);
  const next = mergeInputs(saved, changes);
  const problem = check ? await check(saved, next) : null;
  if (problem) return { ok: false, error: problem };
  await prisma.performanceReview.upsert({
    where,
    create: { userId: employeeId, kind, period, inputs: JSON.stringify(next), updatedById: actorId },
    update: { inputs: JSON.stringify(next), updatedById: actorId },
  });
  return { ok: true, previous: saved, next };
}

export async function loadReport(
  employeeId: string,
  kind: ReviewKind,
  period: string,
  today: string = toISO(new Date()),
): Promise<{ report: Report; meta: ReviewMeta } | null> {
  const employee = await findEmployee(employeeId);
  if (!employee) return null;

  const { from, to } = periodRange(kind, period);
  const asOf = to < today ? to : today;

  const [settings, tasks, entries, leaves, remarks, saved, monthly] = await Promise.all([
    getSettingsParsed(),
    prisma.task.findMany({
      where: {
        assignees: { some: { userId: employeeId } },
        // Anything that started after the period can't belong to it.
        OR: [{ startDate: null }, { startDate: { lte: endOf(to) } }],
      },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        important: true,
        startDate: true,
        targetDate: true,
        createdAt: true,
        completedAt: true,
        estimatedHours: true,
        actualHours: true,
        reopenCount: true,
        approvedAt: true,
        project: { select: { name: true } },
        _count: { select: { assignees: true } },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        userId: employeeId,
        date: { gte: startOf(from), lte: endOf(to) },
        hours: { not: null },
      },
      select: { taskId: true, date: true, hours: true, task: { select: { project: { select: { name: true } } } } },
    }),
    prisma.leave.findMany({
      where: { userId: employeeId, approved: true, start: { lte: endOf(to) }, end: { gte: startOf(from) } },
      select: { start: true, end: true, type: true },
    }),
    prisma.remark.count({
      where: { authorId: employeeId, createdAt: { gte: startOf(from), lte: endOf(to) } },
    }),
    prisma.performanceReview.findUnique({
      where: { userId_kind_period: { userId: employeeId, kind, period } },
    }),
    kind === "Yearly"
      ? prisma.performanceReview.findMany({
          where: { userId: employeeId, kind: "Monthly", period: { startsWith: `${period}-` } },
          orderBy: { period: "asc" },
          select: { period: true, inputs: true },
        })
      : Promise.resolve([]),
  ]);

  // Hours on each task by anyone up to the period's end — "actual %" for
  // long-running work.
  const logged = tasks.length
    ? await prisma.timeEntry.groupBy({
        by: ["taskId"],
        where: { taskId: { in: tasks.map((t) => t.id) }, date: { lte: endOf(asOf) } },
        _sum: { hours: true },
      })
    : [];
  const loggedBy = new Map(logged.map((l) => [l.taskId, l._sum.hours ?? 0]));

  const savedBy = saved?.updatedById
    ? await prisma.user.findUnique({ where: { id: saved.updatedById }, select: { name: true } })
    : null;

  const daysPerWeek = Math.max(1, settings.workingDays.length || 5);
  const monthlyRatings: MonthlyRatings[] = monthly.map((r) => {
    const inputs = parseInputs(r.inputs);
    const ratings: Record<string, number> = {};
    for (const [k, v] of Object.entries(inputs)) {
      const m = /^rating\.([A-Za-z]+)\.manager$/.exec(k);
      const n = m ? parseRating(v) : null;
      if (m && n != null) ratings[m[1]] = n;
    }
    return { period: r.period, ratings };
  });

  const report = buildReport(
    {
      kind,
      period,
      today,
      employee: {
        id: employee.id,
        name: employee.name,
        employeeCode: employee.employeeCode ?? "",
        department: employee.department ?? "",
        designation: employee.designation ?? "",
        joined: day(employee.joined),
        // The assigned Reporting Manager; with none assigned, whichever
        // Admin or Lead last saved this review.
        reportingManager:
          employee.reportingManager?.name ?? parseInputs(saved?.inputs)[REVIEWED_BY] ?? "",
        assignedManager: employee.reportingManager?.name ?? "",
      },
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        projectName: t.project.name,
        priority: t.priority,
        status: t.status,
        important: t.important,
        startDate: day(t.startDate),
        targetDate: day(t.targetDate),
        createdAt: toISO(t.createdAt),
        // Never in the future: a Done task with no completedAt (created
        // straight into Done) or one whose deadline is still ahead would
        // otherwise read as "In Progress" for the current period.
        completedAt: completionDay(
          {
            status: t.status,
            completedAt: day(t.completedAt),
            targetDate: day(t.targetDate),
            createdAt: toISO(t.createdAt),
          },
          today,
        ),
        estimatedHours: t.estimatedHours,
        actualHours: t.actualHours,
        reopenCount: t.reopenCount,
        approved: !!t.approvedAt,
        logged: loggedBy.get(t.id) ?? 0,
        coAssignees: Math.max(0, t._count.assignees - 1),
      })),
      entries: entries.map((e) => ({
        taskId: e.taskId,
        projectName: e.task.project.name,
        date: toISO(e.date),
        hours: e.hours ?? 0,
      })),
      leaves: leaves.map((l) => ({ start: toISO(l.start), end: toISO(l.end), type: l.type })),
      remarks,
      workDays: workingDaySet(settings.workingDays),
      hoursPerDay: (employee.capacityPerWeek || 40) / daysPerWeek,
      monthly: monthlyRatings.filter((m) => Object.keys(m.ratings).length > 0),
    },
    parseInputs(saved?.inputs),
  );

  return {
    report,
    meta: { savedAt: saved ? saved.updatedAt.toISOString() : null, savedBy: savedBy?.name ?? null },
  };
}
