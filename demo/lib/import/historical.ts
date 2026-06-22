/**
 * Shared engine for the weekly-tracker import. The same code powers two
 * front-ends:
 *   - the CLI one-shot (scripts/import-historical.ts), reading *.csv off
 *     the bind-mounted /import folder, and
 *   - the Settings → Import page (app/api/import), reading an uploaded
 *     Ongoing_Projects.xlsx.
 *
 * Everything here is server-only (it pulls bcryptjs + Prisma). The parsing
 * is pure (string[][] in → ParsedTask[] out); the DB writes are isolated
 * in commitParsed() and parameterised by a Prisma client + a dryRun flag
 * so the preview step can compute real counts without touching the DB.
 *
 * Idempotent: clients match by name, projects by (clientId, name), tasks
 * by (projectId, title), users by email — re-running updates rather than
 * duplicates.
 */

import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

/* ------------------------------------------------------------------ */
/* Static mappings                                                     */
/* ------------------------------------------------------------------ */

export type GlobalRole =
  | "Admin"
  | "Lead"
  | "Coordinator"
  | "Developer"
  | "BusinessDeveloper";

type PersonSpec = {
  fullName: string;
  email: string;
  role: GlobalRole;
};

/** Canonical first-name → identity. Aliases (typos / casing) are
 *  normalised before lookup via NAME_ALIASES below. */
const PEOPLE: Record<string, PersonSpec> = {
  Abhishek: {
    fullName: "Abhishek Bankar",
    email: "abhishek.bankar@inventivebizsol.com",
    role: "Lead",
  },
  Adhil: {
    fullName: "Adhil Mohammed",
    email: "adhil.mohammed@inventivebizsol.com",
    role: "Developer",
  },
  Adnan: {
    fullName: "Adnan Ahmed",
    email: "adnan.ahmed@inventivebizsol.com",
    role: "Developer",
  },
  Akshay: {
    fullName: "Akshay Hagare",
    email: "akshay.hagare@inventivebizsol.com",
    role: "Developer",
  },
  "Anil Kadam": {
    fullName: "Anil Kadam",
    email: "anil.kadam@inventivebizsol.com",
    role: "Developer",
  },
  Ankit: {
    fullName: "Ankit Gopwad",
    email: "ankit.gopwad@inventivebizsol.com",
    role: "Developer",
  },
  Himanshu: {
    fullName: "Himanshu Patil",
    email: "himanshu.patil@inventivebizsol.com",
    role: "Developer",
  },
  Javed: {
    fullName: "Javed Sutar",
    email: "javed.sutar@inventivebizsol.com",
    role: "Admin",
  },
  Kiran: {
    fullName: "Kiran Jaware",
    email: "kiran.jaware@inventivebizsol.com",
    role: "Developer",
  },
  Manoj: {
    fullName: "Manoj Biradar",
    email: "manoj.biradar@inventivebizsol.com",
    role: "Developer",
  },
  Mansi: {
    fullName: "Mansi Mali",
    email: "mansi.mali@inventivebizsol.com",
    role: "Coordinator",
  },
  Monika: {
    fullName: "Monika Shinde",
    email: "monika.shinde@inventivebizsol.com",
    role: "Developer",
  },
  Moreshwar: {
    fullName: "Moreshwar Bhalsing",
    email: "moreshwar.bhalsing@inventivebizsol.com",
    role: "Admin",
  },
  Pooja: {
    fullName: "Pooja",
    email: "pooja@inventivebizsol.com",
    role: "Coordinator",
  },
  Priyanka: {
    fullName: "Priyanka Patil",
    email: "priyanka.patil@inventivebizsol.com",
    role: "Developer",
  },
  Pushpalata: {
    fullName: "Pushpalata Patil",
    email: "pushpalata.patil@inventivebizsol.com",
    role: "Coordinator",
  },
  Ravish: {
    fullName: "Ravish Lad",
    email: "ravish.lad@inventivebizsol.com",
    role: "Coordinator",
  },
  Sanjana: {
    fullName: "Sanjana Jadhav",
    email: "sanjana.jadhav@inventivebizsol.com",
    role: "Developer",
  },
  Sanjay: {
    fullName: "Sanjay Jadhav",
    email: "sanjay.jadhav@inventivebizsol.com",
    role: "Developer",
  },
  Varad: {
    fullName: "Varad Hadawale",
    email: "varad.hadawale@inventivebizsol.com",
    role: "Lead",
  },
  Viraj: {
    fullName: "Viraj Pangavhane",
    email: "viraj.pangavhane@inventivebizsol.com",
    role: "Developer",
  },
  Vishal: {
    fullName: "Vishal Rajguru",
    email: "vishal.rajguru@inventivebizsol.com",
    role: "Developer",
  },
};

/** Typo / casing variants → canonical key in PEOPLE. Empty string means
 *  "looks like a person but isn't a real user" — intentionally skipped,
 *  not reported as unmatched. */
const NAME_ALIASES: Record<string, string> = {
  adil: "Adhil",
  adhil: "Adhil",
  sanajana: "Sanjana",
  sanjana: "Sanjana",
  manasi: "Mansi",
  mansi: "Mansi",
  "sanjay j": "Sanjay",
  "sanjay j.": "Sanjay",
  varad: "Varad",
  manoj: "Manoj",
  monika: "Monika",
  abhishek: "Abhishek",
  client: "",
  draftsman: "",
  draftsmans: "",
  "draftsman's": "",
  tbd: "",
  deepak: "",
  paresh: "",
  abhay: "",
  parag: "",
  vijay: "",
  // Structural / role words that can leak out of header or label cells —
  // not people, so skip them silently rather than flag as unmatched.
  lead: "",
  leads: "",
  coordinator: "",
  "co-ordinator": "",
  coordinators: "",
  team: "",
  member: "",
  members: "",
  developer: "",
  developers: "",
  na: "",
  "n/a": "",
  none: "",
};

/** xlsx sheet name (normalised, lower-case) → service area label. Sheets
 *  not listed here (e.g. the dashboard tab) are not project sheets and
 *  get skipped. */
const SHEET_TO_SERVICE: Record<string, string> = {
  amc: "AMC",
  pocs: "POCs",
  "samanvay - engg memory": "Samanvay",
  "support automation": "Support Automation",
  "thermax enimax": "Thermax ENIMAX",
  "thermax p&id": "Thermax P&ID",
  "thermax qa": "Thermax QA",
};

/** Resolve an xlsx sheet name to its service area, or null if the sheet
 *  isn't a project sheet we know how to import. */
export function serviceAreaForSheet(sheetName: string): string | null {
  const key = String(sheetName ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return SHEET_TO_SERVICE[key] ?? null;
}

/** Sub-project labels that are PEOPLE (internal stakeholders) not
 *  external customers. */
const INTERNAL_STAKEHOLDER_LABELS = new Set(
  ["Anil Kadam", "Moreshwar", "Mansi"].map((s) => s.toLowerCase()),
);

const STATUS_MAP: Record<string, string> = {
  "to do": "To Do",
  "to start": "To Do",
  "to start ": "To Do",
  todo: "To Do",
  "in progress": "In Progress",
  "in progres": "In Progress",
  "in progress ": "In Progress",
  blocked: "Blocked",
  hold: "Blocked",
  dependency: "Blocked",
  deferred: "Blocked",
  done: "Done",
  "in review": "In review",
  review: "In review",
  "": "To Do",
};

const PRIORITY_MAP: Record<string, string> = {
  p1: "High",
  p2: "Medium",
  p3: "Low",
  high: "High",
  medium: "Medium",
  low: "Low",
  critical: "Critical",
  "": "Medium",
};

/* ------------------------------------------------------------------ */
/* Parsing helpers (pure)                                              */
/* ------------------------------------------------------------------ */

function normalise(s: unknown): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

type Fragment =
  | { kind: "person"; key: string }
  | { kind: "skip" }
  | { kind: "unknown" };

/** Classify one name fragment: a known person, a deliberate skip
 *  (placeholder labels), or genuinely unknown (worth reporting). */
function classifyFragment(raw: string): Fragment {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return { kind: "skip" };
  const key = cleaned.toLowerCase().replace(/\.$/, "");
  if (key in NAME_ALIASES) {
    const aliased = NAME_ALIASES[key];
    return aliased ? { kind: "person", key: aliased } : { kind: "skip" };
  }
  const firstWord = cleaned.split(/\s+/)[0];
  for (const k of Object.keys(PEOPLE)) {
    if (k.toLowerCase() === firstWord.toLowerCase()) return { kind: "person", key: k };
  }
  for (const k of Object.keys(PEOPLE)) {
    if (k.toLowerCase() === cleaned.toLowerCase()) return { kind: "person", key: k };
  }
  return { kind: "unknown" };
}

/** Split a multi-person cell into canonical PEOPLE keys, dropping
 *  anything that can't be resolved. Unknown fragments are added to the
 *  optional `unmatched` collector for the preview's reconciliation list. */
function splitPeople(raw: string, unmatched?: Set<string>): string[] {
  if (!raw) return [];
  const parts = raw.split(/[,+/&]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const frag = p.trim();
    if (!frag) continue;
    const r = classifyFragment(frag);
    if (r.kind === "person") {
      if (!seen.has(r.key)) {
        out.push(r.key);
        seen.add(r.key);
      }
    } else if (r.kind === "unknown" && unmatched) {
      unmatched.add(frag);
    }
  }
  return out;
}

function mapStatus(raw: string): string {
  return STATUS_MAP[normalise(raw).toLowerCase()] ?? "To Do";
}

function mapPriority(raw: string): string {
  return PRIORITY_MAP[normalise(raw).toLowerCase()] ?? "Medium";
}

/** Parse "13-May-26" / "13-May-2026" / "27/4/2026" to a Date or null.
 *  Indian convention for `/` = DD/MM/YYYY. */
function parseDateCell(raw: string): Date | null {
  const s = normalise(raw);
  if (!s || /tbd/i.test(s)) return null;
  const m1 = s.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})$/);
  if (m1) {
    const day = Number(m1[1]);
    const monthNames = "jan,feb,mar,apr,may,jun,jul,aug,sep,oct,nov,dec".split(",");
    const monthIdx = monthNames.indexOf(m1[2].slice(0, 3).toLowerCase());
    if (monthIdx < 0) return null;
    let year = Number(m1[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, monthIdx, day));
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m2) {
    let year = Number(m2[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, Number(m2[2]) - 1, Number(m2[1])));
  }
  return null;
}

function parseHoursCell(raw: string): number | null {
  const s = normalise(raw);
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n;
  const w = s.match(/^(\d+)\s*weeks?$/i);
  if (w) return Number(w[1]) * 40;
  return null;
}

/* ------------------------------------------------------------------ */
/* Sheet section parsing                                               */
/* ------------------------------------------------------------------ */

type CsvRow = string[];

export type ParsedTask = {
  serviceArea: string;
  subProjectLabel: string;
  description: string;
  priority: string;
  status: string;
  startDate: Date | null;
  targetDate: Date | null;
  estimatedHours: number | null;
  responsibleNames: string[];
  assigneeNames: string[];
  approvedByNames: string[];
  remark: string;
  weekIndex: number;
};

type TeamHeader = { lead: string[]; coordinator: string[]; members: string[] };

export type ParsedSheet = {
  serviceArea: string;
  teamLead: string[];
  teamCoordinator: string[];
  teamMembers: string[];
  tasks: ParsedTask[];
};

function extractTeamHeader(rows: CsvRow[], unmatched?: Set<string>): TeamHeader {
  const lead: string[] = [];
  const coordinator: string[] = [];
  const members: string[] = [];
  for (const r of rows.slice(0, 12)) {
    for (let c = 0; c < r.length - 1; c++) {
      const label = normalise(r[c]).toLowerCase();
      const value = normalise(r[c + 1]);
      if (!value) continue;
      if (/^team lead/.test(label) || label === "lead") {
        lead.push(...splitPeople(value, unmatched));
      } else if (/^co.?ordinator$/.test(label)) {
        coordinator.push(...splitPeople(value, unmatched));
      } else if (/^team members?$/.test(label) || label === "team") {
        members.push(...splitPeople(value, unmatched));
      }
    }
  }
  return {
    lead: Array.from(new Set(lead)),
    coordinator: Array.from(new Set(coordinator)),
    members: Array.from(new Set(members)),
  };
}

function detectTaskColumns(row: CsvRow): Record<string, number> | null {
  const idx: Record<string, number> = {};
  let hits = 0;
  row.forEach((cell, i) => {
    const c = normalise(cell).toLowerCase();
    if (/^sr\.? ?no/i.test(c)) {
      idx.srNo = i;
      hits++;
    } else if (c === "priority") {
      idx.priority = i;
      hits++;
    } else if (/^task description/.test(c)) {
      idx.description = i;
      hits++;
    } else if (/^task assign by/.test(c)) {
      idx.assignBy = i;
      hits++;
    } else if (/^person responsible/.test(c)) {
      idx.personResponsible = i;
      hits++;
    } else if (/^effort/.test(c) || /efforts \(hrs\)/i.test(c)) {
      idx.efforts = i;
      hits++;
    } else if (/^start date/.test(c)) {
      idx.startDate = i;
      hits++;
    } else if (/^target ?date/.test(c)) {
      idx.targetDate = i;
      hits++;
    } else if (c === "status") {
      idx.status = i;
      hits++;
    } else if (/^approved by/.test(c)) {
      idx.approvedBy = i;
      hits++;
    } else if (/^remark/.test(c)) {
      idx.remark = i;
      hits++;
    } else if (/^project/.test(c)) {
      idx.project = i;
      hits++;
    }
  });
  return hits >= 3 ? idx : null;
}

function detectWeekHeader(row: CsvRow): number | null {
  for (let i = 0; i < Math.min(row.length, 3); i++) {
    const c = normalise(row[i]).toLowerCase();
    const m = c.match(/^week\s*(\d+)/);
    if (m) return Number(m[1]);
    if (c === "week") {
      const n = Number(normalise(row[i + 1]));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Parse one service-area sheet (already split into rows) into team
 *  header + task rows. Pure — no DB, no file IO. */
export function parseSheet(
  serviceArea: string,
  rows: CsvRow[],
  unmatched?: Set<string>,
): ParsedSheet {
  const header = extractTeamHeader(rows, unmatched);
  const tasks: ParsedTask[] = [];

  let currentWeek = 0;
  let columns: Record<string, number> | null = null;
  let stickySubProject = "";

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    if (row.every((c) => !normalise(c))) continue;

    const wk = detectWeekHeader(row);
    if (wk != null) {
      currentWeek = wk;
      columns = null;
      stickySubProject = "";
      continue;
    }

    const cols = detectTaskColumns(row);
    if (cols) {
      columns = cols;
      continue;
    }

    const firstCell = normalise(row[0]);
    const projMatch = firstCell.match(/^Project:\s*(.+)$/i);
    if (projMatch) {
      stickySubProject = projMatch[1].trim();
      continue;
    }

    if (!columns) continue;

    const get = (key: string): string =>
      columns![key] != null ? normalise(row[columns![key]]) : "";

    const description = get("description");
    if (!description) continue;
    if (/^\(no tasks/i.test(description)) continue;

    let subProjectLabel =
      columns!.project != null ? normalise(row[columns!.project]) : "";
    if (!subProjectLabel) subProjectLabel = stickySubProject;
    if (!subProjectLabel) subProjectLabel = serviceArea;

    tasks.push({
      serviceArea,
      subProjectLabel,
      description,
      priority: mapPriority(get("priority")),
      status: mapStatus(get("status")),
      startDate: parseDateCell(get("startDate")),
      targetDate: parseDateCell(get("targetDate")),
      estimatedHours: parseHoursCell(get("efforts")),
      responsibleNames: splitPeople(get("assignBy"), unmatched),
      assigneeNames: splitPeople(get("personResponsible"), unmatched),
      approvedByNames: splitPeople(get("approvedBy"), unmatched),
      remark: get("remark"),
      weekIndex: currentWeek,
    });
  }

  return {
    serviceArea,
    teamLead: header.lead,
    teamCoordinator: header.coordinator,
    teamMembers: header.members,
    tasks,
  };
}

function dedupTasks(tasks: ParsedTask[]): ParsedTask[] {
  const seen = new Map<string, ParsedTask>();
  for (const t of tasks) {
    const key = [
      t.serviceArea,
      t.subProjectLabel.toLowerCase().replace(/\s+/g, " ").trim(),
      t.description.toLowerCase().replace(/\s+/g, " ").trim(),
    ].join("||");
    const prev = seen.get(key);
    if (!prev || prev.weekIndex < t.weekIndex) seen.set(key, t);
  }
  return Array.from(seen.values());
}

function classifyClient(subProjectLabel: string): {
  clientName: string;
  projectName: string;
} {
  const cleaned = subProjectLabel.trim().replace(/\s+/g, " ");
  const lower = cleaned.toLowerCase();
  const baseMatch = cleaned.match(/^([^-—]+?)(?:\s*[-—]\s*(.+))?$/);
  const base = (baseMatch?.[1] ?? cleaned).trim();
  const variant = baseMatch?.[2]?.trim();

  if (
    INTERNAL_STAKEHOLDER_LABELS.has(base.toLowerCase()) ||
    INTERNAL_STAKEHOLDER_LABELS.has(lower)
  ) {
    return {
      clientName: "Internal",
      projectName: variant ? `Internal — ${base} — ${variant}` : `Internal — ${base}`,
    };
  }
  return {
    clientName: base,
    projectName: variant ? `${base} — ${variant}` : base,
  };
}

/* ------------------------------------------------------------------ */
/* Parse a whole workbook (set of sheets)                              */
/* ------------------------------------------------------------------ */

export type SheetInput = { serviceArea: string; rows: CsvRow[] };

export type ParseResult = {
  tasks: ParsedTask[]; // deduped to latest week
  rawTaskCount: number;
  headerByService: Map<string, TeamHeader>;
  unmatchedNames: string[];
  perSheet: { serviceArea: string; taskCount: number; lead: string[]; coordinator: string[] }[];
};

/** Parse + dedup a set of service-area sheets. Pure (no DB). */
export function parseSheets(sheets: SheetInput[]): ParseResult {
  const unmatched = new Set<string>();
  const all: ParsedTask[] = [];
  const headerByService = new Map<string, TeamHeader>();
  const perSheet: ParseResult["perSheet"] = [];

  for (const { serviceArea, rows } of sheets) {
    const parsed = parseSheet(serviceArea, rows, unmatched);
    headerByService.set(serviceArea, {
      lead: parsed.teamLead,
      coordinator: parsed.teamCoordinator,
      members: parsed.teamMembers,
    });
    all.push(...parsed.tasks);
    perSheet.push({
      serviceArea,
      taskCount: parsed.tasks.length,
      lead: parsed.teamLead,
      coordinator: parsed.teamCoordinator,
    });
  }

  return {
    tasks: dedupTasks(all),
    rawTaskCount: all.length,
    headerByService,
    unmatchedNames: Array.from(unmatched).sort((a, b) => a.localeCompare(b)),
    perSheet,
  };
}

/* ------------------------------------------------------------------ */
/* DB writers                                                          */
/* ------------------------------------------------------------------ */

export type ImportStats = {
  usersCreated: number;
  usersReused: number;
  clientsCreated: number;
  clientsReused: number;
  projectsCreated: number;
  projectsReused: number;
  tasksCreated: number;
  tasksUpdated: number;
  remarksCreated: number;
  memberRowsCreated: number;
};

function emptyStats(): ImportStats {
  return {
    usersCreated: 0,
    usersReused: 0,
    clientsCreated: 0,
    clientsReused: 0,
    projectsCreated: 0,
    projectsReused: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    remarksCreated: 0,
    memberRowsCreated: 0,
  };
}

export type CommitResult = {
  stats: ImportStats;
  unknownPeopleKeys: string[];
};

/**
 * Apply a ParseResult to the database. With `dryRun: true` it only reads
 * (to compute accurate created-vs-reused counts) and writes nothing.
 * Idempotent: safe to run repeatedly.
 */
export async function commitParsed(
  prisma: PrismaClient,
  parsed: ParseResult,
  opts: { dryRun: boolean },
): Promise<CommitResult> {
  const dryRun = opts.dryRun;
  const stats = emptyStats();
  const tasks = parsed.tasks;
  const headerByService = parsed.headerByService;
  const unknownPeople = new Set<string>();

  const userCache = new Map<string, string>();
  const clientCache = new Map<string, number>();

  async function ensureUser(spec: PersonSpec): Promise<string> {
    const cached = userCache.get(spec.email);
    if (cached) return cached;
    const existing = await prisma.user.findUnique({
      where: { email: spec.email },
      select: { id: true },
    });
    if (existing) {
      userCache.set(spec.email, existing.id);
      stats.usersReused += 1;
      return existing.id;
    }
    if (dryRun) {
      const fakeId = `dry:${spec.email}`;
      userCache.set(spec.email, fakeId);
      stats.usersCreated += 1;
      return fakeId;
    }
    const passwordHash = await bcrypt.hash("Tracker@2026", 10);
    const created = await prisma.user.create({
      data: {
        email: spec.email,
        name: spec.fullName,
        passwordHash,
        primaryRole: spec.role,
        isAdmin: spec.role === "Admin",
        isActive: true,
      },
      select: { id: true },
    });
    userCache.set(spec.email, created.id);
    stats.usersCreated += 1;
    return created.id;
  }

  async function ensureClient(name: string): Promise<number> {
    const cached = clientCache.get(name);
    if (cached) return cached;
    const existing = await prisma.client.findFirst({
      where: { name },
      select: { id: true },
    });
    if (existing) {
      clientCache.set(name, existing.id);
      stats.clientsReused += 1;
      return existing.id;
    }
    if (dryRun) {
      const fakeId = -(clientCache.size + 1);
      clientCache.set(name, fakeId);
      stats.clientsCreated += 1;
      return fakeId;
    }
    const created = await prisma.client.create({
      data: {
        name,
        industry: "Engineering / Automation",
        primaryContact: "—",
        email: "",
        since: new Date(),
      },
      select: { id: true },
    });
    clientCache.set(name, created.id);
    stats.clientsCreated += 1;
    return created.id;
  }

  async function ensureProject(args: {
    clientId: number;
    name: string;
    startDate: Date;
    targetDate: Date;
    budgetHours: number;
  }): Promise<number> {
    const { clientId, name, startDate, targetDate, budgetHours } = args;
    if (clientId >= 0) {
      const existing = await prisma.project.findFirst({
        where: { clientId, name },
        select: { id: true },
      });
      if (existing) {
        stats.projectsReused += 1;
        return existing.id;
      }
    }
    if (dryRun) {
      stats.projectsCreated += 1;
      return -(stats.projectsCreated + 1);
    }
    const created = await prisma.project.create({
      data: {
        name,
        clientId,
        status: "Active",
        startDate,
        targetDate,
        budgetHours,
        loggedHours: 0,
        progress: 0,
        health: "green",
      },
      select: { id: true },
    });
    stats.projectsCreated += 1;
    return created.id;
  }

  async function ensureMember(args: {
    projectId: number;
    userId: string;
    role: string;
  }): Promise<void> {
    const { projectId, userId, role } = args;
    if (dryRun) {
      stats.memberRowsCreated += 1;
      return;
    }
    if (projectId < 0 || userId.startsWith("dry:")) return;
    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId_role: { projectId, userId, role } },
      select: { userId: true },
    });
    if (existing) return;
    await prisma.projectMember.create({ data: { projectId, userId, role } });
    stats.memberRowsCreated += 1;
  }

  async function upsertTask(args: {
    projectId: number;
    task: ParsedTask;
    responsibleId: string | null;
    assigneeIds: string[];
    approverId: string | null;
  }): Promise<void> {
    const { projectId, task, responsibleId, assigneeIds, approverId } = args;
    const fullDesc = task.description.replace(/\s+/g, " ").trim();
    const title = fullDesc.length > 180 ? fullDesc.slice(0, 177) + "..." : fullDesc;
    const description = fullDesc.length > 180 ? fullDesc : null;
    const targetDate = task.targetDate ?? task.startDate ?? new Date();

    if (dryRun || projectId < 0) {
      stats.tasksCreated += 1;
      if (task.remark.trim()) stats.remarksCreated += 1;
      return;
    }

    const existing = await prisma.task.findFirst({
      where: { projectId, title },
      select: { id: true },
    });
    let taskId: number;
    if (existing) {
      await prisma.task.update({
        where: { id: existing.id },
        data: {
          description,
          priority: task.priority,
          status: task.status,
          startDate: task.startDate,
          targetDate,
          estimatedHours: task.estimatedHours,
          responsibleId: responsibleId ?? undefined,
          approvedById:
            task.status === "Done" && approverId ? approverId : undefined,
          approvedAt: task.status === "Done" && approverId ? new Date() : undefined,
        },
      });
      taskId = existing.id;
      stats.tasksUpdated += 1;
    } else {
      const created = await prisma.task.create({
        data: {
          title,
          description,
          projectId,
          priority: task.priority,
          status: task.status,
          startDate: task.startDate,
          targetDate,
          estimatedHours: task.estimatedHours,
          responsibleId,
          approvedById: task.status === "Done" && approverId ? approverId : null,
          approvedAt: task.status === "Done" && approverId ? new Date() : null,
          important: task.priority === "Critical",
        },
        select: { id: true },
      });
      taskId = created.id;
      stats.tasksCreated += 1;
    }

    for (const userId of assigneeIds) {
      if (userId.startsWith("dry:")) continue;
      await prisma.taskAssignee
        .create({ data: { taskId, userId } })
        .catch(() => {
          /* duplicate — ignore */
        });
    }

    if (task.remark.trim() && responsibleId && !responsibleId.startsWith("dry:")) {
      const remarkBody = task.remark.trim();
      const existingRemark = await prisma.remark.findFirst({
        where: { taskId, body: remarkBody },
        select: { id: true },
      });
      if (!existingRemark) {
        await prisma.remark.create({
          data: { taskId, authorId: responsibleId, body: remarkBody },
        });
        stats.remarksCreated += 1;
      }
    }
  }

  // 1) Ensure every referenced person exists.
  const referenced = new Set<string>();
  for (const t of tasks) {
    [...t.responsibleNames, ...t.assigneeNames, ...t.approvedByNames].forEach((n) =>
      referenced.add(n),
    );
  }
  for (const h of headerByService.values()) {
    [...h.lead, ...h.coordinator, ...h.members].forEach((n) => referenced.add(n));
  }
  for (const name of referenced) {
    const spec = PEOPLE[name];
    if (!spec) {
      unknownPeople.add(name);
      continue;
    }
    await ensureUser(spec);
  }

  // 2) Walk tasks, ensuring client+project, applying rosters.
  const projectByKey = new Map<string, number>();
  for (const t of tasks) {
    const { clientName, projectName } = classifyClient(t.subProjectLabel);
    const clientId = await ensureClient(clientName);

    const projectKey = `${clientId}::${projectName}`;
    let projectId = projectByKey.get(projectKey);
    if (projectId == null) {
      const projectTasks = tasks.filter((x) => {
        const c = classifyClient(x.subProjectLabel);
        return c.clientName === clientName && c.projectName === projectName;
      });
      const startCandidates = projectTasks
        .map((x) => x.startDate)
        .filter((d): d is Date => d != null);
      const targetCandidates = projectTasks
        .map((x) => x.targetDate)
        .filter((d): d is Date => d != null);
      const startDate =
        startCandidates.length > 0
          ? new Date(Math.min(...startCandidates.map((d) => d.getTime())))
          : new Date();
      const targetDate =
        targetCandidates.length > 0
          ? new Date(Math.max(...targetCandidates.map((d) => d.getTime())))
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const budgetHours = projectTasks.reduce(
        (s, x) => s + (x.estimatedHours ?? 0),
        0,
      );
      projectId = await ensureProject({
        clientId,
        name: projectName,
        startDate,
        targetDate,
        budgetHours: Math.max(budgetHours, 40),
      });
      projectByKey.set(projectKey, projectId);

      const header = headerByService.get(t.serviceArea);
      if (header) {
        for (const name of header.lead) {
          const spec = PEOPLE[name];
          if (!spec) continue;
          await ensureMember({ projectId, userId: userCache.get(spec.email)!, role: "Lead" });
        }
        for (const name of header.coordinator) {
          const spec = PEOPLE[name];
          if (!spec) continue;
          await ensureMember({
            projectId,
            userId: userCache.get(spec.email)!,
            role: "Coordinator",
          });
        }
        for (const name of header.members) {
          const spec = PEOPLE[name];
          if (!spec) continue;
          await ensureMember({
            projectId,
            userId: userCache.get(spec.email)!,
            role: "Developer",
          });
        }
      }
    }

    const responsibleSpec = t.responsibleNames[0]
      ? PEOPLE[t.responsibleNames[0]]
      : undefined;
    const responsibleId = responsibleSpec
      ? (userCache.get(responsibleSpec.email) ?? null)
      : null;
    const assigneeIds = t.assigneeNames
      .map((n) => PEOPLE[n]?.email)
      .filter((e): e is string => !!e)
      .map((e) => userCache.get(e))
      .filter((id): id is string => !!id);
    const approverSpec = t.approvedByNames[0]
      ? PEOPLE[t.approvedByNames[0]]
      : undefined;
    const approverId = approverSpec
      ? (userCache.get(approverSpec.email) ?? null)
      : null;

    for (const userId of [...assigneeIds, responsibleId].filter(
      (id): id is string => !!id,
    )) {
      await ensureMember({ projectId, userId, role: "Developer" });
    }

    await upsertTask({ projectId, task: t, responsibleId, assigneeIds, approverId });
  }

  return { stats, unknownPeopleKeys: Array.from(unknownPeople) };
}