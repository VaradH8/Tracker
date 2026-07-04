/**
 * Per-project task import. Unlike the workbook importer in ./historical.ts
 * (which spins up clients, projects, users and tasks from the whole
 * Ongoing_Projects.xlsx), this is deliberately narrow: given ONE project
 * and a simple table of task rows, create/update Tasks on that project and
 * nothing else. It powers the "Import Tasks" button on a project page.
 *
 * The parsing half is pure (string[][] in → ParsedTaskRow[] out). The DB
 * writes live in commitTaskRows(), parameterised by a Prisma client and a
 * dryRun flag so the preview can compute real created-vs-updated counts
 * without touching the database.
 *
 * Idempotent: tasks match by (projectId, title) — re-running the same file
 * updates the existing rows instead of duplicating them.
 */

import type { PrismaClient } from "@prisma/client";
import { userByFirstName } from "@/lib/server-access";

/* ------------------------------------------------------------------ */
/* Value mappings — forgiving about the exact spelling in the sheet.   */
/* ------------------------------------------------------------------ */

const STATUS_MAP: Record<string, string> = {
  "to do": "To Do",
  "to start": "To Do",
  todo: "To Do",
  "not started": "To Do",
  open: "To Do",
  "in progress": "In Progress",
  "in progres": "In Progress",
  wip: "In Progress",
  ongoing: "In Progress",
  blocked: "Blocked",
  hold: "Blocked",
  "on hold": "Blocked",
  dependency: "Blocked",
  deferred: "Blocked",
  "in review": "In review",
  review: "In review",
  "in-review": "In review",
  done: "Done",
  complete: "Done",
  completed: "Done",
  closed: "Done",
  "": "To Do",
};

const PRIORITY_MAP: Record<string, string> = {
  p1: "High",
  p2: "Medium",
  p3: "Low",
  critical: "Critical",
  urgent: "Critical",
  high: "High",
  medium: "Medium",
  med: "Medium",
  normal: "Medium",
  low: "Low",
  "": "Medium",
};

function normalise(s: unknown): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapStatus(raw: string): string {
  return STATUS_MAP[normalise(raw).toLowerCase()] ?? "To Do";
}

function mapPriority(raw: string): string {
  return PRIORITY_MAP[normalise(raw).toLowerCase()] ?? "Medium";
}

/** Parse "13-May-26" / "13-May-2026" / "27/4/2026" / "2026-05-13" to a
 *  Date, or null. Indian convention for `/` = DD/MM/YYYY. */
function parseDateCell(raw: string): Date | null {
  const s = normalise(raw);
  if (!s || /tbd|n\/?a/i.test(s)) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }

  const named = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/);
  if (named) {
    const months = "jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec".split(",");
    const monthIdx = months.indexOf(named[2].slice(0, 3).toLowerCase());
    if (monthIdx < 0) return null;
    let year = Number(named[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, monthIdx, Number(named[1])));
  }

  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, Number(slash[2]) - 1, Number(slash[1])));
  }
  return null;
}

function parseHoursCell(raw: string): number | null {
  const s = normalise(raw);
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n;
  const weeks = s.match(/^(\d+(?:\.\d+)?)\s*weeks?$/i);
  if (weeks) return Number(weeks[1]) * 40;
  const hrs = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)$/i);
  if (hrs) return Number(hrs[1]);
  return null;
}

/** Split a "Adhil, Mansi / Ravish" style people cell into first names. */
function splitNames(raw: string): string[] {
  const s = normalise(raw);
  if (!s || /tbd|n\/?a|none/i.test(s)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of s.split(/[,+/&;]| and /i)) {
    const name = part.trim().replace(/\.$/, "");
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Column detection + row parsing (pure)                               */
/* ------------------------------------------------------------------ */

type Columns = {
  title?: number;
  description?: number;
  priority?: number;
  status?: number;
  startDate?: number;
  targetDate?: number;
  hours?: number;
  assignees?: number;
  responsible?: number;
  remark?: number;
};

/** Detect a header row. Returns the column map only if a title/task column
 *  is present — that's the one column we can't do without. */
function detectColumns(row: string[]): Columns | null {
  const idx: Columns = {};
  row.forEach((cell, i) => {
    const c = normalise(cell).toLowerCase();
    if (!c) return;
    if (idx.title == null && /^(task ?description|task|title|work item|activity|summary)$/.test(c)) {
      idx.title = i;
    } else if (idx.description == null && /^description$/.test(c)) {
      idx.description = i;
    } else if (idx.priority == null && /^priority$/.test(c)) {
      idx.priority = i;
    } else if (idx.status == null && /^status$/.test(c)) {
      idx.status = i;
    } else if (idx.startDate == null && /^start ?date$/.test(c)) {
      idx.startDate = i;
    } else if (idx.targetDate == null && /^(target ?date|due ?date|end ?date|deadline)$/.test(c)) {
      idx.targetDate = i;
    } else if (idx.hours == null && /^(effort|efforts|estimated hours|est\.? ?hours|hours|estimate)/.test(c)) {
      idx.hours = i;
    } else if (idx.assignees == null && /^(assignees?|assigned to|person accountable|accountable)/.test(c)) {
      idx.assignees = i;
    } else if (idx.responsible == null && /^(person responsible|responsible|assigned by|task assign by|owner)/.test(c)) {
      idx.responsible = i;
    } else if (idx.remark == null && /^(remarks?|notes?|comments?)/.test(c)) {
      idx.remark = i;
    }
  });
  // A lone "Description" column with no "Task/Title" column still counts —
  // treat it as the title source.
  if (idx.title == null && idx.description != null) {
    idx.title = idx.description;
    idx.description = undefined;
  }
  return idx.title != null ? idx : null;
}

export type ParsedTaskRow = {
  title: string;
  description: string | null;
  priority: string;
  status: string;
  startDate: Date | null;
  targetDate: Date | null;
  estimatedHours: number | null;
  assigneeNames: string[];
  responsibleName: string | null;
  remark: string;
};

export type ParseTasksResult = {
  tasks: ParsedTaskRow[]; // deduped by title
  rawRowCount: number; // task-bearing rows seen before dedup
  headerFound: boolean;
};

/** Parse a single sheet's rows into task rows. Pure — no DB, no file IO. */
export function parseTaskRows(rows: string[][]): ParseTasksResult {
  let columns: Columns | null = null;
  const parsed: ParsedTaskRow[] = [];

  for (const row of rows) {
    if (!row || row.every((c) => !normalise(c))) continue;

    if (!columns) {
      columns = detectColumns(row);
      continue; // the header row itself is never a task
    }

    const get = (key: keyof Columns): string => {
      const at = columns![key];
      return at != null ? normalise(row[at]) : "";
    };

    const rawTitle = get("title");
    if (!rawTitle) continue;
    if (/^\(no tasks/i.test(rawTitle)) continue;

    const longDesc = get("description");
    const fullTitle = rawTitle.replace(/\s+/g, " ").trim();
    let title: string;
    let description: string | null;
    if (fullTitle.length > 180) {
      title = fullTitle.slice(0, 177) + "...";
      description = longDesc || fullTitle;
    } else {
      title = fullTitle;
      description = longDesc || null;
    }

    parsed.push({
      title,
      description,
      priority: mapPriority(get("priority")),
      status: mapStatus(get("status")),
      startDate: parseDateCell(get("startDate")),
      targetDate: parseDateCell(get("targetDate")),
      estimatedHours: parseHoursCell(get("hours")),
      assigneeNames: splitNames(get("assignees")),
      responsibleName: splitNames(get("responsible"))[0] ?? null,
      remark: get("remark"),
    });
  }

  // Last row wins on a duplicate title so a re-export with edits imports
  // the latest values.
  const byTitle = new Map<string, ParsedTaskRow>();
  for (const t of parsed) {
    byTitle.set(t.title.toLowerCase().replace(/\s+/g, " ").trim(), t);
  }

  return {
    tasks: Array.from(byTitle.values()),
    rawRowCount: parsed.length,
    headerFound: columns != null,
  };
}

/* ------------------------------------------------------------------ */
/* DB writer                                                           */
/* ------------------------------------------------------------------ */

export type TaskImportStats = {
  tasksCreated: number;
  tasksUpdated: number;
  assigneesLinked: number;
  remarksCreated: number;
};

export type CommitTasksResult = {
  stats: TaskImportStats;
  unmatchedNames: string[];
};

/**
 * Apply parsed task rows to one project. With `dryRun: true` it only reads
 * (to compute accurate created-vs-updated counts and the unmatched-names
 * list) and writes nothing. Idempotent — safe to run repeatedly.
 *
 * Assignee / responsible names resolve against EXISTING users by first name
 * (same rule as manual task creation); unresolved names are collected for
 * the preview and their task still imports, just unassigned.
 */
export async function commitTaskRows(
  prisma: PrismaClient,
  projectId: number,
  tasks: ParsedTaskRow[],
  opts: { dryRun: boolean; actorId: string },
): Promise<CommitTasksResult> {
  const { dryRun, actorId } = opts;
  const stats: TaskImportStats = {
    tasksCreated: 0,
    tasksUpdated: 0,
    assigneesLinked: 0,
    remarksCreated: 0,
  };
  const unmatched = new Set<string>();
  const idByName = new Map<string, string | null>();

  async function resolve(name: string): Promise<string | null> {
    const key = name.toLowerCase();
    if (idByName.has(key)) return idByName.get(key)!;
    const user = await userByFirstName(name);
    const id = user?.id ?? null;
    idByName.set(key, id);
    if (!id) unmatched.add(name);
    return id;
  }

  for (const t of tasks) {
    const assigneeIds: string[] = [];
    for (const name of t.assigneeNames) {
      const id = await resolve(name);
      if (id && !assigneeIds.includes(id)) assigneeIds.push(id);
    }
    const responsibleId = t.responsibleName
      ? await resolve(t.responsibleName)
      : null;

    const targetDate = t.targetDate ?? t.startDate ?? new Date();

    const existing = await prisma.task.findFirst({
      where: { projectId, title: t.title },
      select: { id: true },
    });

    if (dryRun) {
      if (existing) stats.tasksUpdated += 1;
      else stats.tasksCreated += 1;
      stats.assigneesLinked += assigneeIds.length;
      if (t.remark.trim()) stats.remarksCreated += 1;
      continue;
    }

    let taskId: number;
    if (existing) {
      await prisma.task.update({
        where: { id: existing.id },
        data: {
          description: t.description,
          priority: t.priority,
          status: t.status,
          startDate: t.startDate,
          targetDate,
          estimatedHours: t.estimatedHours,
          important: t.priority === "Critical",
          responsibleId: responsibleId ?? undefined,
        },
      });
      taskId = existing.id;
      stats.tasksUpdated += 1;
    } else {
      const created = await prisma.task.create({
        data: {
          title: t.title,
          description: t.description,
          projectId,
          priority: t.priority,
          status: t.status,
          startDate: t.startDate,
          targetDate,
          estimatedHours: t.estimatedHours,
          important: t.priority === "Critical",
          responsibleId: responsibleId ?? actorId,
        },
        select: { id: true },
      });
      taskId = created.id;
      stats.tasksCreated += 1;
    }

    for (const userId of assigneeIds) {
      try {
        await prisma.taskAssignee.create({ data: { taskId, userId } });
        stats.assigneesLinked += 1;
      } catch {
        /* already linked — ignore the unique-constraint failure */
      }
    }

    const remarkBody = t.remark.trim();
    if (remarkBody) {
      const authorId = responsibleId ?? actorId;
      const dup = await prisma.remark.findFirst({
        where: { taskId, body: remarkBody },
        select: { id: true },
      });
      if (!dup) {
        await prisma.remark.create({
          data: { taskId, authorId, body: remarkBody },
        });
        stats.remarksCreated += 1;
      }
    }
  }

  return { stats, unmatchedNames: Array.from(unmatched).sort((a, b) => a.localeCompare(b)) };
}
