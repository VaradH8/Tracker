/**
 * One-shot importer for the weekly tracker CSVs the team has been
 * maintaining in Excel since week 19. Reads every *.csv in a directory,
 * normalises the messy hand-edited cells, deduplicates rolling weeks to
 * the latest known state, and writes Users / Clients / Projects /
 * ProjectMembers / Tasks / TaskAssignees / Remarks into the live DB.
 *
 * Usage (from the app container):
 *   npx tsx scripts/import-historical.ts --dir /import --dry-run
 *   npx tsx scripts/import-historical.ts --dir /import
 *
 * --dry-run prints exactly what it would do without touching the DB.
 * The flag is opt-OUT — running without --dry-run writes for real.
 */

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import Papa from "papaparse";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ */
/* Args                                                                */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const IMPORT_DIR =
  argv.find((a) => a.startsWith("--dir="))?.slice("--dir=".length) ??
  (argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : null) ??
  "/import";

/* ------------------------------------------------------------------ */
/* Static mappings                                                     */
/* ------------------------------------------------------------------ */

type GlobalRole = "Admin" | "Coordinator" | "Developer" | "BusinessDeveloper";

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
    role: "Developer",
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
    role: "Developer",
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
    // User-specified one-off — they didn't have a surname for Pooja
    // and asked for a custom email format.
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
    email: "varadhadawale@gmail.com",
    role: "Admin",
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

/** Typo / casing variants → canonical key in PEOPLE. */
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
  // Names that look like people but are not real users in our system.
  // Mapped to the empty string so resolvePerson() skips them.
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
};

/** Filename → service area label. */
const FILE_TO_SERVICE: Record<string, string> = {
  "Ongoing Projects (3)-AMC.csv": "AMC",
  "Ongoing Projects (3)-POCs.csv": "POCs",
  "Ongoing Projects (3)-Samanvay - Engg Memory.csv": "Samanvay",
  "Ongoing Projects (3)-Support Automation .csv": "Support Automation",
  "Ongoing Projects (3)-Thermax ENIMAX.csv": "Thermax ENIMAX",
  "Ongoing Projects (3)-Thermax P&ID.csv": "Thermax P&ID",
  "Ongoing Projects (3)-Thermax QA.csv": "Thermax QA",
};

/** Sub-project labels that are PEOPLE (internal stakeholders) not
 *  external customers. Tasks under these get routed to the special
 *  "Internal" client, with the person's name baked into the project
 *  name so the data stays attributable. */
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
  // Empty → To Do (safest default)
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
/* Parsing helpers                                                     */
/* ------------------------------------------------------------------ */

function normalise(s: unknown): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a single name-fragment to a canonical PEOPLE key (or null
 *  if it should be skipped). Tries alias map first; if unknown, uses
 *  the first-name as the key when it matches PEOPLE. */
function resolvePerson(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  const key = cleaned.toLowerCase().replace(/\.$/, "");
  if (key in NAME_ALIASES) {
    const aliased = NAME_ALIASES[key];
    return aliased || null;
  }
  // Match by lowercase first-name against PEOPLE keys.
  const firstWord = cleaned.split(/\s+/)[0];
  for (const k of Object.keys(PEOPLE)) {
    if (k.toLowerCase() === firstWord.toLowerCase()) return k;
  }
  // Multi-word keys like "Anil Kadam"
  for (const k of Object.keys(PEOPLE)) {
    if (k.toLowerCase() === cleaned.toLowerCase()) return k;
  }
  return null;
}

/** Split a multi-person cell like "Vishal ,adhil,manoj" or
 *  "Mansi, Monika" or "Viraj+Adhil+Manoj+Varad" into canonical PEOPLE
 *  keys, dropping anything that can't be resolved. */
function splitPeople(raw: string): string[] {
  if (!raw) return [];
  const parts = raw.split(/[,+/&]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const r = resolvePerson(p);
    if (r && !seen.has(r)) {
      out.push(r);
      seen.add(r);
    }
  }
  return out;
}

/** Map a status cell to one of our enum values. */
function mapStatus(raw: string): string {
  const key = normalise(raw).toLowerCase();
  return STATUS_MAP[key] ?? "To Do";
}

function mapPriority(raw: string): string {
  const key = normalise(raw).toLowerCase();
  return PRIORITY_MAP[key] ?? "Medium";
}

/** Parse "13-May-26" or "13-May-2026" or "27/4/2026" or "5/12/2026"
 *  or "" / "TBD" to a Date or null. Indian convention for `/` = DD/MM/YYYY. */
function parseDateCell(raw: string): Date | null {
  const s = normalise(raw);
  if (!s || /tbd/i.test(s)) return null;
  // DD-MMM-YY or DD-MMM-YYYY
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
  // DD/MM/YYYY (Indian convention)
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
  // Bare number
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n;
  // "3 weeks" → 3 * 40 = 120
  const w = s.match(/^(\d+)\s*weeks?$/i);
  if (w) return Number(w[1]) * 40;
  return null;
}

/* ------------------------------------------------------------------ */
/* CSV section parsing                                                 */
/* ------------------------------------------------------------------ */

type CsvRow = string[];

type ParsedTask = {
  serviceArea: string;
  subProjectLabel: string; // raw from column 1
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
  weekIndex: number; // higher = later, for dedup
};

type ParsedCsv = {
  serviceArea: string;
  teamLead: string[]; // canonical names
  teamCoordinator: string[];
  teamMembers: string[];
  tasks: ParsedTask[];
};

/** Inspect the first ~10 rows of a CSV to lift the team header. The
 *  Lead/Coordinator/Team Members labels sit in different columns
 *  depending on file (cells 7+ in some, 9+ in others). Search by
 *  label text rather than column position. */
function extractTeamHeader(rows: CsvRow[]): {
  lead: string[];
  coordinator: string[];
  members: string[];
} {
  const lead: string[] = [];
  const coordinator: string[] = [];
  const members: string[] = [];
  for (const r of rows.slice(0, 12)) {
    for (let c = 0; c < r.length - 1; c++) {
      const label = normalise(r[c]).toLowerCase();
      const value = normalise(r[c + 1]);
      if (!value) continue;
      if (/^team lead/.test(label) || label === "lead") {
        lead.push(...splitPeople(value));
      } else if (/^co.?ordinator$/.test(label)) {
        coordinator.push(...splitPeople(value));
      } else if (/^team members?$/.test(label) || label === "team") {
        members.push(...splitPeople(value));
      }
    }
  }
  return {
    lead: Array.from(new Set(lead)),
    coordinator: Array.from(new Set(coordinator)),
    members: Array.from(new Set(members)),
  };
}

/** Find the column index for each task field in a header row.
 *  Returns null if this doesn't look like a header row. */
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
  // Need at least description + priority + status to call it a header.
  return hits >= 3 ? idx : null;
}

/** Detect a "Week 23" / "Week,23" / "Week 25 (15 June - 19 June)" row.
 *  Returns the week number or null. */
function detectWeekHeader(row: CsvRow): number | null {
  for (let i = 0; i < Math.min(row.length, 3); i++) {
    const c = normalise(row[i]).toLowerCase();
    // "Week 25 (...)" pattern
    const m = c.match(/^week\s*(\d+)/);
    if (m) return Number(m[1]);
    // "Week, 25" style — Week in col 0, number in col 1
    if (c === "week") {
      const next = normalise(row[i + 1]);
      const n = Number(next);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseCsv(filename: string, content: string): ParsedCsv {
  const serviceArea = FILE_TO_SERVICE[filename];
  if (!serviceArea) {
    throw new Error(
      `Unknown CSV: ${filename} — add it to FILE_TO_SERVICE in import-historical.ts`,
    );
  }

  const result = Papa.parse<CsvRow>(content, { header: false });
  const rows = result.data as CsvRow[];

  const header = extractTeamHeader(rows);
  const tasks: ParsedTask[] = [];

  let currentWeek = 0;
  let columns: Record<string, number> | null = null;
  // For the Samanvay CSV the sub-project label sits on its own row
  // ("Project: Saipem") rather than in column 1 of every task.
  let stickySubProject = "";

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const allEmpty = row.every((c) => !normalise(c));
    if (allEmpty) continue;

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

    // "Project: Saipem" style sticky label (Samanvay file)
    const firstCell = normalise(row[0]);
    const projMatch = firstCell.match(/^Project:\s*(.+)$/i);
    if (projMatch) {
      stickySubProject = projMatch[1].trim();
      continue;
    }

    if (!columns) continue;

    // Pull fields by column index — every column may or may not exist.
    const get = (key: string): string =>
      columns![key] != null ? normalise(row[columns![key]]) : "";

    const description = get("description");
    if (!description) continue;
    // Some rows are placeholders like "(No tasks yet)".
    if (/^\(no tasks/i.test(description)) continue;

    let subProjectLabel = columns!.project != null ? normalise(row[columns!.project]) : "";
    if (!subProjectLabel) subProjectLabel = stickySubProject;
    if (!subProjectLabel) subProjectLabel = serviceArea; // fallback

    tasks.push({
      serviceArea,
      subProjectLabel,
      description,
      priority: mapPriority(get("priority")),
      status: mapStatus(get("status")),
      startDate: parseDateCell(get("startDate")),
      targetDate: parseDateCell(get("targetDate")),
      estimatedHours: parseHoursCell(get("efforts")),
      responsibleNames: splitPeople(get("assignBy")),
      assigneeNames: splitPeople(get("personResponsible")),
      approvedByNames: splitPeople(get("approvedBy")),
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

/* ------------------------------------------------------------------ */
/* Dedup by latest week                                                */
/* ------------------------------------------------------------------ */

function dedupTasks(tasks: ParsedTask[]): ParsedTask[] {
  // Key = (serviceArea, subProjectLabel-normalised, description-normalised).
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

/* ------------------------------------------------------------------ */
/* Mapping to Client/Project                                           */
/* ------------------------------------------------------------------ */

function classifyClient(subProjectLabel: string): {
  clientName: string;
  projectName: string;
} {
  const cleaned = subProjectLabel.trim().replace(/\s+/g, " ");
  const lower = cleaned.toLowerCase();
  // Strip any " - Variant" suffix to find the base client.
  // E.g. "Praj - Heat Exchanger" → client "Praj", base " - Heat Exchanger".
  const baseMatch = cleaned.match(/^([^-—]+?)(?:\s*[-—]\s*(.+))?$/);
  const base = (baseMatch?.[1] ?? cleaned).trim();
  const variant = baseMatch?.[2]?.trim();

  if (INTERNAL_STAKEHOLDER_LABELS.has(base.toLowerCase()) || INTERNAL_STAKEHOLDER_LABELS.has(lower)) {
    return {
      clientName: "Internal",
      projectName: variant
        ? `Internal — ${base} — ${variant}`
        : `Internal — ${base}`,
    };
  }
  return {
    clientName: base,
    projectName: variant ? `${base} — ${variant}` : base,
  };
}

/* ------------------------------------------------------------------ */
/* DB writers                                                          */
/* ------------------------------------------------------------------ */

type Stats = {
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

async function ensureUser(
  spec: PersonSpec,
  cache: Map<string, string>,
  stats: Stats,
): Promise<string> {
  const cached = cache.get(spec.email);
  if (cached) return cached;
  const existing = await prisma.user.findUnique({
    where: { email: spec.email },
    select: { id: true },
  });
  if (existing) {
    cache.set(spec.email, existing.id);
    stats.usersReused += 1;
    return existing.id;
  }
  if (DRY_RUN) {
    const fakeId = `dry:${spec.email}`;
    cache.set(spec.email, fakeId);
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
  cache.set(spec.email, created.id);
  stats.usersCreated += 1;
  return created.id;
}

async function ensureClient(
  name: string,
  cache: Map<string, number>,
  stats: Stats,
): Promise<number> {
  const cached = cache.get(name);
  if (cached) return cached;
  const existing = await prisma.client.findFirst({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    cache.set(name, existing.id);
    stats.clientsReused += 1;
    return existing.id;
  }
  if (DRY_RUN) {
    const fakeId = -Math.floor(Math.random() * 100000);
    cache.set(name, fakeId);
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
  cache.set(name, created.id);
  stats.clientsCreated += 1;
  return created.id;
}

async function ensureProject(args: {
  clientId: number;
  name: string;
  startDate: Date;
  targetDate: Date;
  budgetHours: number;
  stats: Stats;
}): Promise<number> {
  const { clientId, name, startDate, targetDate, budgetHours, stats } = args;
  const existing = await prisma.project.findFirst({
    where: { clientId, name },
    select: { id: true },
  });
  if (existing) {
    stats.projectsReused += 1;
    return existing.id;
  }
  if (DRY_RUN) {
    stats.projectsCreated += 1;
    return -Math.floor(Math.random() * 100000);
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
  stats: Stats;
}): Promise<void> {
  const { projectId, userId, role, stats } = args;
  if (DRY_RUN) {
    stats.memberRowsCreated += 1;
    return;
  }
  if (projectId < 0 || userId.startsWith("dry:")) return;
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId_role: { projectId, userId, role } },
    select: { userId: true },
  });
  if (existing) return;
  await prisma.projectMember.create({
    data: { projectId, userId, role },
  });
  stats.memberRowsCreated += 1;
}

async function upsertTask(args: {
  projectId: number;
  task: ParsedTask;
  responsibleId: string | null;
  assigneeIds: string[];
  approverId: string | null;
  stats: Stats;
}): Promise<number | null> {
  const { projectId, task, responsibleId, assigneeIds, approverId, stats } = args;
  // Cap title to 200 chars; spill the rest into description.
  const fullDesc = task.description.replace(/\s+/g, " ").trim();
  const title = fullDesc.length > 180 ? fullDesc.slice(0, 177) + "..." : fullDesc;
  const description = fullDesc.length > 180 ? fullDesc : null;
  const targetDate = task.targetDate ?? task.startDate ?? new Date();
  if (DRY_RUN || projectId < 0) {
    stats.tasksCreated += 1;
    if (task.remark.trim()) stats.remarksCreated += 1;
    return null;
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
          task.status === "Done" && approverId
            ? approverId
            : undefined,
        approvedAt:
          task.status === "Done" && approverId ? new Date() : undefined,
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

  // Assignees — additive (don't remove existing) so re-running doesn't
  // wipe people who got added in the app after the previous import.
  for (const userId of assigneeIds) {
    if (userId.startsWith("dry:")) continue;
    await prisma.taskAssignee
      .create({ data: { taskId, userId } })
      .catch(() => {
        /* duplicate — ignore */
      });
  }

  if (task.remark.trim() && responsibleId && !responsibleId.startsWith("dry:")) {
    // Match on (taskId, body) so re-runs don't duplicate the remark.
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
  return taskId;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\n--- import-historical ---`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`Reading from: ${IMPORT_DIR}\n`);

  if (!fs.existsSync(IMPORT_DIR)) {
    console.error(`Directory not found: ${IMPORT_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(IMPORT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();
  if (files.length === 0) {
    console.error("No .csv files in import directory.");
    process.exit(1);
  }

  const allTasks: ParsedTask[] = [];
  const headerByService = new Map<
    string,
    { lead: string[]; coordinator: string[]; members: string[] }
  >();

  for (const f of files) {
    const content = fs.readFileSync(path.join(IMPORT_DIR, f), "utf-8");
    try {
      const parsed = parseCsv(f, content);
      console.log(
        `  ${f.padEnd(48)} → ${parsed.tasks.length} task rows, lead=${parsed.teamLead.join("/") || "-"} coord=${parsed.teamCoordinator.join("/") || "-"}`,
      );
      headerByService.set(parsed.serviceArea, {
        lead: parsed.teamLead,
        coordinator: parsed.teamCoordinator,
        members: parsed.teamMembers,
      });
      allTasks.push(...parsed.tasks);
    } catch (e) {
      console.warn(`  ${f} skipped: ${(e as Error).message}`);
    }
  }

  const tasks = dedupTasks(allTasks);
  console.log(
    `\nParsed ${allTasks.length} rows → ${tasks.length} unique tasks after latest-week dedup\n`,
  );

  const stats: Stats = {
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

  const userCache = new Map<string, string>();
  const clientCache = new Map<string, number>();

  // 1) Ensure every PEOPLE entry that's referenced anywhere is in the DB.
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
      console.warn(`  ! Unknown PEOPLE key: "${name}" (skipping)`);
      continue;
    }
    await ensureUser(spec, userCache, stats);
  }

  // 2) Walk tasks, ensuring client+project for each, applying team
  //    rosters from the service area's header.
  const projectByKey = new Map<string, number>();
  for (const t of tasks) {
    const { clientName, projectName } = classifyClient(t.subProjectLabel);
    const clientId = await ensureClient(clientName, clientCache, stats);

    const projectKey = `${clientId}::${projectName}`;
    let projectId = projectByKey.get(projectKey);
    if (projectId == null) {
      // Choose plausible start/target for the project from task dates.
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
        stats,
      });
      projectByKey.set(projectKey, projectId);

      // Apply rosters
      const header = headerByService.get(t.serviceArea);
      if (header) {
        for (const name of header.lead) {
          const spec = PEOPLE[name];
          if (!spec) continue;
          await ensureMember({
            projectId,
            userId: userCache.get(spec.email)!,
            role: "Lead",
            stats,
          });
        }
        for (const name of header.coordinator) {
          const spec = PEOPLE[name];
          if (!spec) continue;
          await ensureMember({
            projectId,
            userId: userCache.get(spec.email)!,
            role: "Coordinator",
            stats,
          });
        }
        for (const name of header.members) {
          const spec = PEOPLE[name];
          if (!spec) continue;
          await ensureMember({
            projectId,
            userId: userCache.get(spec.email)!,
            role: "Developer",
            stats,
          });
        }
      }
    }

    // Resolve task-level people
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

    // Make sure every assignee is also a project member (otherwise they
    // can't see the project, which would break our own access rules).
    for (const userId of [...assigneeIds, responsibleId].filter(
      (id): id is string => !!id,
    )) {
      await ensureMember({ projectId, userId, role: "Developer", stats });
    }

    await upsertTask({
      projectId,
      task: t,
      responsibleId,
      assigneeIds,
      approverId,
      stats,
    });
  }

  // 3) Audit trail
  if (!DRY_RUN) {
    // Use the first Admin we created/found as the actor.
    const admin = await prisma.user.findFirst({
      where: { isAdmin: true },
      select: { id: true },
    });
    if (admin) {
      await prisma.auditEntry.create({
        data: {
          actorId: admin.id,
          action: "import.historical",
          scope: "weekly-tracker-csv",
          before: null,
          after: `${stats.tasksCreated + stats.tasksUpdated} tasks across ${stats.projectsCreated + stats.projectsReused} projects`,
        },
      });
    }
  }

  console.log("\n--- summary ---");
  console.log(
    `Users:    ${stats.usersCreated} created, ${stats.usersReused} reused`,
  );
  console.log(
    `Clients:  ${stats.clientsCreated} created, ${stats.clientsReused} reused`,
  );
  console.log(
    `Projects: ${stats.projectsCreated} created, ${stats.projectsReused} reused`,
  );
  console.log(`Roster rows: ${stats.memberRowsCreated} created`);
  console.log(
    `Tasks:    ${stats.tasksCreated} created, ${stats.tasksUpdated} updated`,
  );
  console.log(`Remarks:  ${stats.remarksCreated} created`);
  console.log(
    `\n${DRY_RUN ? "DRY RUN — no DB writes. Re-run without --dry-run to apply." : "Done. Imported."}\n`,
  );
}

main()
  .catch((e) => {
    console.error("\nIMPORT FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
