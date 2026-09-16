/**
 * Ask Tracker — turning a ParsedAsk into a real answer.
 *
 * Every query here is scoped through the same helpers the rest of the API
 * uses (visibleProjectIds / canSeeAllProjectTasks / taskAssignmentFilter),
 * so a Coordinator asking "what's overdue?" gets the overdue tasks on
 * *their* projects and nothing else. The chat is a new way to phrase a
 * question, never a new way to reach data — it is strictly read-only and
 * adds no visibility that the asker didn't already have.
 */

import { prisma } from "@/lib/db";
import { todayISO } from "@/lib/mock";
import {
  canSeeAllProjectTasks,
  taskAssignmentFilter,
  visibleProjectIds,
  type SessionUser,
} from "@/lib/server-access";
import { overdueDaysFor } from "@/lib/serializers";
import {
  includesOverdue,
  windowRange,
  WINDOW_LABELS,
  type AskVocabulary,
  type ParsedAsk,
  type WindowKind,
} from "./parse";

/* ------------------------------------------------------------------ */
/* Answer shape                                                        */
/* ------------------------------------------------------------------ */

export type AskTaskRow = {
  id: number;
  title: string;
  status: string;
  priority: string;
  projectId: number;
  projectName: string;
  targetDate: string | null;
  overdueDays?: number;
  assignees: string[];
  important: boolean;
};

export type AskPersonRow = {
  id: string;
  name: string;
  role: string;
  open: number;
  overdue: number;
  dueToday: number;
  estimatedHours: number;
  capacityPerWeek: number;
};

export type AskProjectRow = {
  id: number;
  name: string;
  clientName: string;
  status: string;
  health: string;
  progress: number;
  targetDate: string;
  open: number;
  overdue: number;
};

export type AskLeaveRow = {
  id: number;
  name: string;
  start: string;
  end: string;
  type: string;
  approved: boolean;
};

export type AskAnswer = {
  /** One-line answer. Always present — the rest is supporting detail. */
  headline: string;
  detail?: string;
  /** How the question was read ("Tasks · Varad Dawale · today"), shown
   *  small under the answer so a misread is obvious and correctable. */
  understood?: string;
  tasks?: AskTaskRow[];
  people?: AskPersonRow[];
  projects?: AskProjectRow[];
  leaves?: AskLeaveRow[];
  suggestions?: string[];
  link?: { href: string; label: string };
};

/* ------------------------------------------------------------------ */
/* Scoping                                                             */
/* ------------------------------------------------------------------ */

type Scope = {
  projectIds: number[] | "all";
  /** Prisma clause limiting tasks to what this asker may already see. */
  taskClause: Record<string, unknown>;
};

async function scopeFor(user: SessionUser): Promise<Scope> {
  const projectIds = await visibleProjectIds(user);
  const taskClause: Record<string, unknown> = {};
  if (projectIds !== "all") taskClause.projectId = { in: projectIds };
  // Ask Tracker is gated to oversight roles today, so this branch is
  // inert — kept so the answers stay correct if the gate ever widens.
  if (!canSeeAllProjectTasks(user.role)) {
    Object.assign(taskClause, taskAssignmentFilter(user.id));
  }
  return { projectIds, taskClause };
}

/** Compose the scope clause with per-question filters. Always an `AND`
 *  array: several handlers need their own top-level `OR`, and merging
 *  those into one object would silently widen the scope clause. */
function taskWhere(
  scope: Scope,
  projectId: number | null,
  ...extra: Record<string, unknown>[]
) {
  const clauses: Record<string, unknown>[] = [scope.taskClause, ...extra];
  // resolveProject() only ever returns a project from the asker's own
  // vocabulary, so narrowing to it can't escape the scope clause above.
  if (projectId !== null) clauses.push({ projectId });
  return { AND: clauses };
}

function startOfDay(iso: string): Date {
  return new Date(iso + "T00:00:00.000Z");
}

function endOfDay(iso: string): Date {
  return new Date(iso + "T23:59:59.999Z");
}

/** Target-date clause for a window. `today` and `this week` also pull in
 *  work that is already late — see includesOverdue() in parse.ts. */
function dueClause(w: WindowKind, today: string): Record<string, unknown> {
  const { from, to } = windowRange(w, today);
  if (!from || !to) return {};
  if (includesOverdue(w)) return { targetDate: { lte: endOfDay(to) } };
  return { targetDate: { gte: startOfDay(from), lte: endOfDay(to) } };
}

/* ------------------------------------------------------------------ */
/* Vocabulary — the names this asker is allowed to ask about           */
/* ------------------------------------------------------------------ */

const PROJECT_MEMBER_SELECT = { userId: true } as const;

/** Users the asker can legitimately ask about: anyone rostered on, or
 *  holding a task in, a project they can see — plus themselves. Admins
 *  get every active user. */
export async function visiblePeopleIds(
  user: SessionUser,
  scope: Scope,
): Promise<string[] | "all"> {
  if (scope.projectIds === "all") return "all";
  const [members, assignees] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: { in: scope.projectIds } },
      select: PROJECT_MEMBER_SELECT,
    }),
    prisma.taskAssignee.findMany({
      where: { task: { projectId: { in: scope.projectIds } } },
      select: { userId: true },
    }),
  ]);
  return Array.from(
    new Set([
      user.id,
      ...members.map((m) => m.userId),
      ...assignees.map((a) => a.userId),
    ]),
  );
}

/** Build the parser's vocabulary from the asker's own scope. */
export async function askVocabulary(
  user: SessionUser,
): Promise<AskVocabulary> {
  const scope = await scopeFor(user);
  const peopleIds = await visiblePeopleIds(user, scope);

  const [people, projects] = await Promise.all([
    prisma.user.findMany({
      where:
        peopleIds === "all"
          ? { isActive: true }
          : { isActive: true, id: { in: peopleIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where:
        scope.projectIds === "all" ? {} : { id: { in: scope.projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    me: { id: user.id, name: user.name },
    people,
    projects,
  };
}

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

type TaskWithRels = {
  id: number;
  title: string;
  status: string;
  priority: string;
  projectId: number;
  targetDate: Date | null;
  important: boolean;
  project?: { name: string } | null;
  assignees?: { user: { name: string } }[];
};

function toTaskRow(t: TaskWithRels): AskTaskRow {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    projectId: t.projectId,
    projectName: t.project?.name ?? "",
    targetDate: t.targetDate ? t.targetDate.toISOString().slice(0, 10) : null,
    overdueDays: overdueDaysFor(t.targetDate, t.status),
    assignees: (t.assignees ?? []).map((a) => a.user.name.split(" ")[0]),
    important: t.important,
  };
}

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  projectId: true,
  targetDate: true,
  important: true,
  project: { select: { name: true } },
  assignees: { select: { user: { select: { name: true } } } },
} as const;

/** Most-urgent-first: overdue before on-time, then priority, then date. */
const PRIORITY_RANK: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

function byUrgency(a: AskTaskRow, b: AskTaskRow): number {
  const ao = a.overdueDays ?? 0;
  const bo = b.overdueDays ?? 0;
  if (ao !== bo) return bo - ao;
  const ap = PRIORITY_RANK[a.priority] ?? 9;
  const bp = PRIORITY_RANK[b.priority] ?? 9;
  if (ap !== bp) return ap - bp;
  if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
  if (a.targetDate) return -1;
  if (b.targetDate) return 1;
  return a.id - b.id;
}

/** How many rows a single answer will show. Anything longer gets a
 *  "+N more" line and a link into the matching full-page view — the chat
 *  answers the question, the page is where you work the list. */
const MAX_ROWS = 12;

function trim<T>(rows: T[]): { shown: T[]; extra: number } {
  return { shown: rows.slice(0, MAX_ROWS), extra: Math.max(0, rows.length - MAX_ROWS) };
}

function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Varad Dawale has" / "You have" — keeps answers readable either way. */
function subject(parsed: ParsedAsk): { who: string; has: string } {
  if (!parsed.person) return { who: "", has: "" };
  return parsed.personIsMe
    ? { who: "You", has: "have" }
    : { who: parsed.person.name, has: "has" };
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

export async function answerAsk(
  user: SessionUser,
  parsed: ParsedAsk,
  suggestions: string[],
): Promise<AskAnswer> {
  const scope = await scopeFor(user);
  const today = todayISO();
  const base = { understood: parsed.understood };

  switch (parsed.topic) {
    case "help":
      return {
        ...base,
        headline: "Ask me about tasks, workload, projects and leave.",
        detail:
          "I read your question against the tracker directly — no data leaves the server. I only answer the shapes below, and I'll tell you when I can't place a question rather than guess.",
        suggestions,
      };

    case "tasks":
      return { ...base, ...(await answerTasks(scope, parsed, today)) };

    case "overdue":
      return { ...base, ...(await answerOverdue(scope, parsed, today)) };

    case "workload":
      return { ...base, ...(await answerWorkload(scope, parsed, today)) };

    case "project_status":
      return { ...base, ...(await answerProjectStatus(scope, parsed, today)) };

    case "projects":
      return { ...base, ...(await answerProjectStatus(scope, parsed, today)) };

    case "unassigned":
      return { ...base, ...(await answerUnassigned(scope, parsed)) };

    case "blocked":
      return { ...base, ...(await answerBlocked(scope, parsed)) };

    case "approvals":
      return { ...base, ...(await answerApprovals(scope, parsed)) };

    case "completed":
      return { ...base, ...(await answerCompleted(scope, parsed, today)) };

    case "leave":
      return { ...base, ...(await answerLeave(user, scope, parsed, today)) };

    case "team":
      return { ...base, ...(await answerTeam(scope, parsed)) };
  }
}

async function answerTasks(
  scope: Scope,
  parsed: ParsedAsk,
  today: string,
): Promise<AskAnswer> {
  const filters: Record<string, unknown>[] = [{ status: { not: "Done" } }];
  if (parsed.person) {
    filters.push({ assignees: { some: { userId: parsed.person.id } } });
  }
  const due = dueClause(parsed.window, today);
  if (Object.keys(due).length) filters.push(due);

  const rows = (
    await prisma.task.findMany({
      where: taskWhere(scope, parsed.project?.id ?? null, ...filters),
      select: TASK_SELECT,
    })
  )
    .map(toTaskRow)
    .sort(byUrgency);

  const { shown, extra } = trim(rows);
  const when =
    parsed.window === "any" ? "" : ` due ${WINDOW_LABELS[parsed.window]}`;
  const where = parsed.project ? ` on ${parsed.project.name}` : "";
  const { who, has } = subject(parsed);

  if (rows.length === 0) {
    return {
      headline: parsed.person
        ? `${who} ${has} nothing open${when}${where}.`
        : `No open tasks${when}${where}.`,
      detail:
        parsed.window === "any"
          ? undefined
          : "Tasks with no deadline set can't fall inside a date window, so they aren't counted here.",
    };
  }

  const overdue = rows.filter((t) => t.overdueDays).length;
  const details: string[] = [];
  if (overdue > 0 && includesOverdue(parsed.window)) {
    details.push(
      `${plural(overdue, "task")} already past the deadline, listed first.`,
    );
  }
  if (extra > 0) details.push(`Showing the ${MAX_ROWS} most urgent of ${rows.length}.`);

  return {
    headline: parsed.person
      ? `${who} ${has} ${plural(rows.length, "task")}${when}${where}.`
      : `${plural(rows.length, "open task")}${when}${where}.`,
    detail: details.join(" ") || undefined,
    tasks: shown,
    link: linkFor(parsed),
  };
}

async function answerOverdue(
  scope: Scope,
  parsed: ParsedAsk,
  today: string,
): Promise<AskAnswer> {
  const filters: Record<string, unknown>[] = [
    { status: { not: "Done" } },
    { targetDate: { lt: startOfDay(today) } },
  ];
  if (parsed.person) {
    filters.push({ assignees: { some: { userId: parsed.person.id } } });
  }

  const rows = (
    await prisma.task.findMany({
      where: taskWhere(scope, parsed.project?.id ?? null, ...filters),
      select: TASK_SELECT,
    })
  )
    .map(toTaskRow)
    .sort(byUrgency);

  const { shown, extra } = trim(rows);
  const where = parsed.project ? ` on ${parsed.project.name}` : "";
  const { who, has } = subject(parsed);

  if (rows.length === 0) {
    return {
      headline: parsed.person
        ? `Nothing overdue for ${parsed.personIsMe ? "you" : parsed.person.name}${where}.`
        : `Nothing is overdue${where}.`,
    };
  }

  const worst = rows[0];
  return {
    headline: parsed.person
      ? `${who} ${has} ${plural(rows.length, "overdue task")}${where}.`
      : `${plural(rows.length, "task")} overdue${where}.`,
    detail:
      `Worst: "${worst.title}" — ${plural(worst.overdueDays ?? 0, "day")} late.` +
      (extra > 0 ? ` Showing ${MAX_ROWS} of ${rows.length}.` : ""),
    tasks: shown,
    link: linkFor(parsed),
  };
}

async function answerWorkload(
  scope: Scope,
  parsed: ParsedAsk,
  today: string,
): Promise<AskAnswer> {
  const filters: Record<string, unknown>[] = [{ status: { not: "Done" } }];
  const due = dueClause(parsed.window, today);
  if (Object.keys(due).length) filters.push(due);

  const tasks = await prisma.task.findMany({
    where: taskWhere(scope, parsed.project?.id ?? null, ...filters),
    select: {
      status: true,
      targetDate: true,
      estimatedHours: true,
      assignees: { select: { userId: true } },
    },
  });

  type Tally = { open: number; overdue: number; dueToday: number; hours: number };
  const tally = new Map<string, Tally>();
  for (const t of tasks) {
    const late = overdueDaysFor(t.targetDate, t.status) !== undefined;
    const onToday = t.targetDate?.toISOString().slice(0, 10) === today;
    for (const a of t.assignees) {
      const cur =
        tally.get(a.userId) ?? { open: 0, overdue: 0, dueToday: 0, hours: 0 };
      cur.open += 1;
      if (late) cur.overdue += 1;
      if (onToday) cur.dueToday += 1;
      cur.hours += t.estimatedHours ?? 0;
      tally.set(a.userId, cur);
    }
  }

  const ids = parsed.person
    ? [parsed.person.id]
    : Array.from(tally.keys());
  if (ids.length === 0) {
    return { headline: "Nobody has open work in the window you asked about." };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      primaryRole: true,
      capacityPerWeek: true,
    },
  });

  const people: AskPersonRow[] = users
    .map((u) => {
      const t = tally.get(u.id) ?? { open: 0, overdue: 0, dueToday: 0, hours: 0 };
      return {
        id: u.id,
        name: u.name,
        role: u.primaryRole,
        open: t.open,
        overdue: t.overdue,
        dueToday: t.dueToday,
        estimatedHours: Math.round(t.hours * 10) / 10,
        capacityPerWeek: u.capacityPerWeek,
      };
    })
    .sort((a, b) => b.estimatedHours - a.estimatedHours || b.overdue - a.overdue);

  const when =
    parsed.window === "any" ? "" : ` (${WINDOW_LABELS[parsed.window]})`;

  if (parsed.person) {
    const p = people[0];
    if (!p) {
      return { headline: `${parsed.person.name} has no open work right now.` };
    }
    const over = p.estimatedHours > p.capacityPerWeek;
    return {
      headline: `${parsed.personIsMe ? "You have" : p.name + " has"} ${plural(
        p.open,
        "open task",
      )}, ${p.estimatedHours}h estimated${when}.`,
      detail:
        `Weekly capacity ${p.capacityPerWeek}h — ` +
        (over
          ? `that's ${Math.round(p.estimatedHours - p.capacityPerWeek)}h over.`
          : `${Math.round(p.capacityPerWeek - p.estimatedHours)}h still free.`) +
        (p.overdue ? ` ${plural(p.overdue, "task")} already overdue.` : ""),
      people,
      link: { href: "/resources", label: "Open Resources" },
    };
  }

  const stretched = people.filter((p) => p.estimatedHours > p.capacityPerWeek);
  return {
    headline: `${plural(people.length, "person", "people")} with open work${when}.`,
    detail: stretched.length
      ? `Over capacity: ${stretched.map((p) => p.name.split(" ")[0]).join(", ")}.`
      : "Everyone is inside their weekly capacity.",
    people: people.slice(0, MAX_ROWS),
    link: { href: "/resources", label: "Open Resources" },
  };
}

async function answerProjectStatus(
  scope: Scope,
  parsed: ParsedAsk,
  today: string,
): Promise<AskAnswer> {
  const where: Record<string, unknown> = {};
  if (scope.projectIds !== "all") where.id = { in: scope.projectIds };
  if (parsed.project) where.id = parsed.project.id;

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      name: true,
      status: true,
      health: true,
      progress: true,
      targetDate: true,
      client: { select: { name: true } },
    },
    orderBy: { targetDate: "asc" },
  });

  if (projects.length === 0) {
    return { headline: "You don't have any projects to report on yet." };
  }

  const counts = await Promise.all(
    projects.map(async (p) => {
      const [open, overdue] = await Promise.all([
        prisma.task.count({
          where: taskWhere(scope, p.id, { status: { not: "Done" } }),
        }),
        prisma.task.count({
          where: taskWhere(scope, p.id, {
            status: { not: "Done" },
            targetDate: { lt: startOfDay(today) },
          }),
        }),
      ]);
      return { open, overdue };
    }),
  );

  const rows: AskProjectRow[] = projects.map((p, i) => ({
    id: p.id,
    name: p.name,
    clientName: p.client.name,
    status: p.status,
    health: p.health,
    progress: p.progress,
    targetDate: p.targetDate.toISOString().slice(0, 10),
    open: counts[i].open,
    overdue: counts[i].overdue,
  }));

  if (parsed.project && rows.length === 1) {
    const r = rows[0];
    return {
      headline: `${r.name} — ${r.status}, ${r.progress}% done, health ${r.health}.`,
      detail: `${plural(r.open, "open task")}, ${r.overdue} overdue. Target ${r.targetDate} for ${r.clientName}.`,
      projects: rows,
      link: { href: `/projects/${r.id}`, label: "Open project" },
    };
  }

  const atRisk = rows.filter((r) => r.health !== "green");
  return {
    headline: `${plural(rows.length, "project")} in your scope.`,
    detail: atRisk.length
      ? `Not green: ${atRisk.map((r) => `${r.name} (${r.health})`).join(", ")}.`
      : "All of them are green.",
    projects: rows.slice(0, MAX_ROWS),
    link: { href: "/projects", label: "Open Projects" },
  };
}

async function answerUnassigned(
  scope: Scope,
  parsed: ParsedAsk,
): Promise<AskAnswer> {
  const rows = (
    await prisma.task.findMany({
      where: taskWhere(scope, parsed.project?.id ?? null, {
        status: { not: "Done" },
        assignees: { none: {} },
      }),
      select: TASK_SELECT,
    })
  )
    .map(toTaskRow)
    .sort(byUrgency);

  const { shown, extra } = trim(rows);
  const where = parsed.project ? ` on ${parsed.project.name}` : "";
  if (rows.length === 0) {
    return { headline: `Every open task${where} has someone on it.` };
  }
  return {
    headline: `${plural(rows.length, "task")} with nobody assigned${where}.`,
    detail: extra > 0 ? `Showing ${MAX_ROWS} of ${rows.length}.` : undefined,
    tasks: shown,
    link: linkFor(parsed),
  };
}

async function answerBlocked(
  scope: Scope,
  parsed: ParsedAsk,
): Promise<AskAnswer> {
  // Blocked means either the status says so, or a dependency it waits on
  // hasn't been finished yet.
  const rows = (
    await prisma.task.findMany({
      where: taskWhere(scope, parsed.project?.id ?? null, {
        status: { not: "Done" },
        OR: [
          { status: "Blocked" },
          { blockedBy: { some: { blockerTask: { status: { not: "Done" } } } } },
        ],
      }),
      select: TASK_SELECT,
    })
  )
    .map(toTaskRow)
    .sort(byUrgency);

  const { shown, extra } = trim(rows);
  const where = parsed.project ? ` on ${parsed.project.name}` : "";
  if (rows.length === 0) {
    return { headline: `Nothing is blocked${where}.` };
  }
  return {
    headline: `${plural(rows.length, "task")} blocked${where}.`,
    detail:
      "Either flagged Blocked, or waiting on a dependency that isn't Done." +
      (extra > 0 ? ` Showing ${MAX_ROWS} of ${rows.length}.` : ""),
    tasks: shown,
    link: linkFor(parsed),
  };
}

async function answerApprovals(
  scope: Scope,
  parsed: ParsedAsk,
): Promise<AskAnswer> {
  const filters: Record<string, unknown>[] = [
    { status: "Done" },
    { approvedAt: null },
  ];
  if (parsed.person) {
    filters.push({ assignees: { some: { userId: parsed.person.id } } });
  }

  const rows = (
    await prisma.task.findMany({
      where: taskWhere(scope, parsed.project?.id ?? null, ...filters),
      select: TASK_SELECT,
      orderBy: { updatedAt: "desc" },
    })
  ).map(toTaskRow);

  const { shown, extra } = trim(rows);
  const where = parsed.project ? ` on ${parsed.project.name}` : "";
  if (rows.length === 0) {
    return { headline: `Nothing is waiting for sign-off${where}.` };
  }
  return {
    headline: `${plural(rows.length, "finished task")} waiting for sign-off${where}.`,
    detail: extra > 0 ? `Showing the ${MAX_ROWS} most recent.` : undefined,
    tasks: shown,
    link: linkFor(parsed),
  };
}

async function answerCompleted(
  scope: Scope,
  parsed: ParsedAsk,
  today: string,
): Promise<AskAnswer> {
  // "What did Varad finish?" with no window is a this-week question.
  const w: WindowKind = parsed.window === "any" ? "this-week" : parsed.window;
  const { from, to } = windowRange(w, today);

  const filters: Record<string, unknown>[] = [{ status: "Done" }];
  if (from && to) {
    filters.push({
      completedAt: { gte: startOfDay(from), lte: endOfDay(to) },
    });
  }
  if (parsed.person) {
    filters.push({ assignees: { some: { userId: parsed.person.id } } });
  }

  const rows = (
    await prisma.task.findMany({
      where: taskWhere(scope, parsed.project?.id ?? null, ...filters),
      select: TASK_SELECT,
      orderBy: { completedAt: "desc" },
    })
  ).map(toTaskRow);

  const { shown, extra } = trim(rows);
  const when = WINDOW_LABELS[w];
  const where = parsed.project ? ` on ${parsed.project.name}` : "";
  const { who, has } = subject(parsed);

  if (rows.length === 0) {
    return {
      headline: parsed.person
        ? `${who} ${has === "have" ? "haven't" : "hasn't"} completed anything ${when}${where}.`
        : `Nothing was completed ${when}${where}.`,
    };
  }
  return {
    headline: parsed.person
      ? `${who} completed ${plural(rows.length, "task")} ${when}${where}.`
      : `${plural(rows.length, "task")} completed ${when}${where}.`,
    detail: extra > 0 ? `Showing the ${MAX_ROWS} most recent.` : undefined,
    tasks: shown,
    link: linkFor(parsed),
  };
}

async function answerLeave(
  user: SessionUser,
  scope: Scope,
  parsed: ParsedAsk,
  today: string,
): Promise<AskAnswer> {
  const { from, to } = windowRange(parsed.window, today);
  const where: Record<string, unknown> = {};

  if (from && to) {
    // Overlap, not containment — a leave that starts Friday and runs into
    // next week is still "on leave this week".
    where.start = { lte: endOfDay(to) };
    where.end = { gte: startOfDay(from) };
  } else {
    where.end = { gte: startOfDay(today) };
  }

  if (parsed.person) {
    where.userId = parsed.person.id;
  } else {
    const ids = await visiblePeopleIds(user, scope);
    if (ids !== "all") where.userId = { in: ids };
  }

  const leaves = await prisma.leave.findMany({
    where,
    select: {
      id: true,
      start: true,
      end: true,
      type: true,
      approved: true,
      user: { select: { name: true } },
    },
    orderBy: { start: "asc" },
  });

  const rows: AskLeaveRow[] = leaves.map((l) => ({
    id: l.id,
    name: l.user.name,
    start: l.start.toISOString().slice(0, 10),
    end: l.end.toISOString().slice(0, 10),
    type: l.type,
    approved: l.approved,
  }));

  const when =
    parsed.window === "any" ? "from today onwards" : WINDOW_LABELS[parsed.window];

  if (rows.length === 0) {
    return {
      headline: parsed.person
        ? `${parsed.personIsMe ? "You have" : parsed.person.name + " has"} no leave ${when}.`
        : `Nobody on your projects is on leave ${when}.`,
      link: { href: "/leaves", label: "Open Leaves" },
    };
  }

  const pending = rows.filter((r) => !r.approved).length;
  // Count people, not rows — someone with two bookings in the window is
  // still one person out of office.
  const headcount = new Set(rows.map((r) => r.name)).size;
  return {
    headline: parsed.person
      ? `${plural(rows.length, "leave")} for ${parsed.personIsMe ? "you" : parsed.person.name} ${when}.`
      : `${plural(headcount, "person", "people")} on leave ${when}.`,
    detail: pending ? `${plural(pending, "request")} still awaiting approval.` : undefined,
    leaves: rows.slice(0, MAX_ROWS),
    link: { href: "/leaves", label: "Open Leaves" },
  };
}

async function answerTeam(scope: Scope, parsed: ParsedAsk): Promise<AskAnswer> {
  const projectIds = parsed.project
    ? [parsed.project.id]
    : scope.projectIds === "all"
      ? null
      : scope.projectIds;

  const members = await prisma.projectMember.findMany({
    where: projectIds ? { projectId: { in: projectIds } } : {},
    select: {
      role: true,
      user: { select: { id: true, name: true, primaryRole: true } },
    },
  });

  if (members.length === 0) {
    return {
      headline: parsed.project
        ? `Nobody is rostered on ${parsed.project.name} yet.`
        : "No one is rostered on your projects yet.",
      link: parsed.project
        ? { href: `/projects/${parsed.project.id}`, label: "Open project" }
        : undefined,
    };
  }

  const openCounts = new Map<string, number>();
  const tasks = await prisma.task.findMany({
    where: taskWhere(scope, parsed.project?.id ?? null, {
      status: { not: "Done" },
    }),
    select: { assignees: { select: { userId: true } } },
  });
  for (const t of tasks) {
    for (const a of t.assignees) {
      openCounts.set(a.userId, (openCounts.get(a.userId) ?? 0) + 1);
    }
  }

  // The schema allows one person to hold several lanes on a project
  // (Lead *and* Developer), so collect the roles rather than keeping
  // whichever row came back first.
  const roles = new Map<string, Set<string>>();
  const seen = new Map<string, { id: string; name: string }>();
  for (const m of members) {
    seen.set(m.user.id, { id: m.user.id, name: m.user.name });
    const set = roles.get(m.user.id) ?? new Set<string>();
    set.add(m.role);
    roles.set(m.user.id, set);
  }

  const people: AskPersonRow[] = Array.from(seen.values())
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: Array.from(roles.get(u.id) ?? []).join(" · "),
      open: openCounts.get(u.id) ?? 0,
      overdue: 0,
      dueToday: 0,
      estimatedHours: 0,
      capacityPerWeek: 0,
    }))
    .sort((a, b) => b.open - a.open);
  return {
    headline: parsed.project
      ? `${plural(people.length, "person", "people")} on ${parsed.project.name}.`
      : `${plural(people.length, "person", "people")} across your projects.`,
    people: people.slice(0, MAX_ROWS),
    link: parsed.project
      ? { href: `/projects/${parsed.project.id}`, label: "Open project" }
      : { href: "/resources", label: "Open Resources" },
  };
}

/** Where the "see the full list" button goes. A project question lands on
 *  that project; anything else on Resources, which every role allowed to
 *  use Ask Tracker can reach. */
function linkFor(parsed: ParsedAsk): { href: string; label: string } {
  if (parsed.project) {
    return { href: `/projects/${parsed.project.id}`, label: "Open project" };
  }
  if (parsed.personIsMe) return { href: "/my-tasks", label: "Open My Tasks" };
  return { href: "/resources", label: "Open Resources" };
}
