export type Priority = "Critical" | "High" | "Medium" | "Low";
export type Status =
  | "To Do"
  | "In Progress"
  | "Blocked"
  | "In review"
  | "Done";
export type ProjectStatus = "Discovery" | "Active" | "On Hold" | "Delivered";
export type PerformanceFlag = "On track" | "Watch" | "Idle";

export type Client = {
  id: number;
  name: string;
  industry: string;
  primaryContact: string;
  email: string;
  since: string;
};

export type ProjectRoleAssignment =
  | "Lead"
  | "Coordinator"
  | "Developer"
  | "BD";

export type Project = {
  id: number;
  name: string;
  clientId: number;
  status: ProjectStatus;
  /** Per-project role rosters, all first-names. Same person may appear in
   *  more than one (e.g. lead + developer). A user sees this project iff
   *  their first name appears in at least one of these arrays (admins see
   *  every project regardless). */
  leads: string[];
  coordinators: string[];
  developers: string[];
  bds: string[];
  startDate: string;
  targetDate: string;
  budgetHours: number;
  loggedHours: number;
  progress: number;
  health: "green" | "yellow" | "red";
  description?: string;
};

export type Task = {
  id: number;
  title: string;
  description?: string;
  projectId: number;
  priority: Priority;
  status: Status;
  /** Person Responsible — who assigned / created the task (single, by first name) */
  responsible: string;
  /** Person Accountable — the doer(s), by first name */
  assignees: string[];
  startDate?: string;
  targetDate: string;
  estimatedHours: number | null;
  actualHours?: number | null;
  important: boolean;
  overdueDays?: number;
  remarks?: Remark[];
  /** IDs of tasks that block this one. The task can't progress until they're Done. */
  dependsOn?: number[];
  attachments?: TaskAttachment[];
  /** Sign-off — set when a Done task is approved by Lead / Coord / Responsible. */
  approvedBy?: string;
  approvedAt?: string;
};

export type Remark = {
  id: number;
  author: string;
  body: string;
  when: string;
};

export type TaskAttachment = {
  id: number;
  name: string;
  size: string;
  uploadedBy: string;
  when: string;
  kind: "pdf" | "image" | "doc" | "sheet" | "other";
};

export type TaskTemplate = {
  id: number;
  name: string;
  description: string;
  priority: Priority;
  estimatedHours: number;
  defaultStatus: Status;
  /** What the template is good for — shown in the picker. */
  hint: string;
};

export type Resource = {
  id: number;
  name: string;
  email: string;
  phone: string;
  location: string;
  joined: string;
  designation: string;
  primaryRole: "Admin" | "Coordinator" | "BusinessDeveloper" | "Developer";
  isAdmin: boolean;
  status: "Active" | "Deactivated";
  lastLogin: string;

  hoursLast7: number;
  hoursLast30: number;
  capacityPerWeek: number;
  tasksDone30: number;
  tasksOpen: number;
  tasksOverdue: number;
  estimateAccuracy: number;
  lastStatusChange: string;
  performance: PerformanceFlag;
  flags: string[];

  /** Internal hourly cost, INR. Admin-only. */
  hourlyRate: number;

  upcomingLeaveStart?: string;
  upcomingLeaveEnd?: string;
};

/** A single logged block of work against a task. */
export type TimeEntry = {
  id: number;
  taskId: number;
  person: string; // first name
  date: string; // YYYY-MM-DD
  hours: number;
  note?: string;
};

export type NotificationKind =
  | "assigned"
  | "status_change"
  | "mention"
  | "blocked"
  | "important"
  | "overdue"
  | "leave_approved"
  | "leave_denied";

export type AppNotification = {
  id: number;
  recipient: string; // first name
  kind: NotificationKind;
  title: string;
  body: string;
  taskId?: number;
  when: string;
  read: boolean;
};

export type EmailLogEntry = {
  id: number;
  to: string; // first name
  toEmail: string;
  subject: string;
  body: string;
  when: string;
  kind: NotificationKind;
  taskId?: number;
};

export type LeaveEntry = {
  id: number;
  resourceName: string;
  start: string;
  end: string;
  type: "Vacation" | "Sick" | "WFH" | "Personal";
  note?: string;
  approved: boolean;
};

export type AuditEntry = {
  id: number;
  when: string;
  actor: string;
  action: string;
  scope: string;
  taskTitle?: string;
  before?: string;
  after?: string;
};

export const CLIENTS: Client[] = [];

export const PROJECTS: Project[] = [];

/* --- Sales pipeline (deals before they become active projects) ----- */

export type PipelineStage = "Lead" | "Quoted" | "Won" | "Kicked off";

export type PipelineDeal = {
  id: number;
  name: string;
  client: string;
  stage: PipelineStage;
  /** estimated contract value, INR */
  estimatedValue: number;
  expectedStart: string;
  /** win probability, percent */
  probability: number;
  bd: string;
};

export const PIPELINE_STAGES: PipelineStage[] = [
  "Lead",
  "Quoted",
  "Won",
  "Kicked off",
];

export const PIPELINE: PipelineDeal[] = [];

export const TASKS: Task[] = [];

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 1,
    name: "Bug — production incident",
    description:
      "Reproduce on the affected environment, isolate the failing branch, ship a fix with a regression test, and close out the customer-facing ticket.",
    priority: "Critical",
    estimatedHours: 4,
    defaultStatus: "In Progress",
    hint: "Use for hotfixes that need a fast turnaround.",
  },
  {
    id: 2,
    name: "Client deliverable — drawing review",
    description:
      "Pull the latest revision, mark up red-lines, circulate to the lead, incorporate feedback, package final PDF for client.",
    priority: "High",
    estimatedHours: 6,
    defaultStatus: "To Do",
    hint: "Standard P&ID / mechanical drawing review cycle.",
  },
  {
    id: 3,
    name: "Weekly client check-in",
    description:
      "Draft the status update from the project board, schedule the call, send the agenda 24 hours before, log notes after.",
    priority: "Medium",
    estimatedHours: 1.5,
    defaultStatus: "To Do",
    hint: "Recurring stakeholder cadence.",
  },
  {
    id: 4,
    name: "Internal — onboarding session",
    description:
      "Prepare the deck, book the room, walk the new hire through accounts and SOPs, assign their first ticket.",
    priority: "Low",
    estimatedHours: 2,
    defaultStatus: "To Do",
    hint: "For a new joiner's first day.",
  },
];

export const RECENT_ACTIVITY: {
  who: string;
  what: string;
  target: string;
  when: string;
}[] = [];

export const RESOURCES: Resource[] = [];

export const LEAVES: LeaveEntry[] = [];

export const AUDIT_LOG: AuditEntry[] = [];

export const TIME_ENTRIES: TimeEntry[] = [];

export const NOTIFICATIONS: AppNotification[] = [];

export const CURRENT_USER = {
  name: "Manasi Kulkarni",
  firstName: "Manasi",
  email: "manasi@example.com",
};

export const ADMIN_USER = {
  name: "Varad Hadawale",
  firstName: "Varad",
  email: "varad@example.com",
};

export const DEVELOPER_USER = {
  name: "Sanjana Jadhav",
  firstName: "Sanjana",
  email: "sanjana@example.com",
};

export const BD_USER = {
  name: "Rohit Mehra",
  firstName: "Rohit",
  email: "rohit@example.com",
};

export function clientById(id: number): Client | undefined {
  return CLIENTS.find((c) => c.id === id);
}

export function projectById(id: number): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}

export function priorityPill(p: Priority): string {
  switch (p) {
    case "Critical":
      return "pill-red";
    case "High":
      return "pill-yellow";
    case "Medium":
      return "pill-blue";
    case "Low":
      return "pill-grey";
  }
}

export function statusPill(s: Status): string {
  switch (s) {
    case "To Do":
      return "pill-grey";
    case "In Progress":
      return "pill-blue";
    case "Blocked":
      return "pill-red";
    case "In review":
      return "pill-yellow";
    case "Done":
      return "pill-green";
  }
}

/** Reference "today" for the mock dataset. */
export const TODAY_ISO = "2026-05-06";

/**
 * ISO 8601 week number for a YYYY-MM-DD string. Matches the "Week 19/20/21..."
 * grouping the Excel tracker uses. Week 1 contains the first Thursday of the
 * year; weeks run Monday → Sunday.
 */
export function weekNumberOf(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

export const CURRENT_WEEK = weekNumberOf(TODAY_ISO);

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0];
}

export function formatINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/**
 * Rough number of days a relative label like "5d ago" / "yesterday" /
 * "3h ago" / "just now" represents. Used to detect idle resources.
 */
export function daysSince(label: string): number {
  const d = label.match(/^(\d+)\s*d/);
  if (d) return Number(d[1]);
  if (/^(yesterday|1\s*day)/i.test(label)) return 1;
  return 0;
}

function daysAgo(iso: string): number {
  const today = new Date(TODAY_ISO + "T00:00:00");
  const d = new Date(iso + "T00:00:00");
  return Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/** Hours a person logged, optionally only within the last `withinDays`. */
export function loggedHours(
  person: string,
  entries: TimeEntry[],
  withinDays?: number,
): number {
  return entries
    .filter((e) => e.person === person)
    .filter((e) => withinDays == null || daysAgo(e.date) < withinDays)
    .reduce((sum, e) => sum + e.hours, 0);
}

/** Total hours logged against a single task by anyone. */
export function loggedHoursForTask(
  taskId: number,
  entries: TimeEntry[],
): number {
  return entries
    .filter((e) => e.taskId === taskId)
    .reduce((sum, e) => sum + e.hours, 0);
}

/** Estimate accuracy for a resource's done tasks: 100 = perfect, <100 = overran. */
export function estimateAccuracyFor(
  person: string,
  tasks: Task[],
  entries: TimeEntry[],
): number | null {
  const done = tasks.filter(
    (t) => t.status === "Done" && t.assignees.includes(person) && t.estimatedHours,
  );
  if (done.length === 0) return null;
  let est = 0;
  let act = 0;
  for (const t of done) {
    est += t.estimatedHours ?? 0;
    const logged = loggedHoursForTask(t.id, entries);
    act += t.actualHours ?? (logged || t.estimatedHours || 0);
  }
  if (act === 0) return 100;
  return Math.round((est / act) * 100);
}

/** Share of a person's done tasks delivered on or before target date. */
export function onTimeRate(person: string, tasks: Task[]): number | null {
  const done = tasks.filter(
    (t) => t.status === "Done" && t.assignees.includes(person),
  );
  if (done.length === 0) return null;
  const onTime = done.filter((t) => !t.overdueDays).length;
  return Math.round((onTime / done.length) * 100);
}

export function resourceByFirstName(name: string): Resource | undefined {
  return RESOURCES.find((r) => firstNameOf(r.name) === name);
}

export function firstNameToEmail(firstName: string): string {
  return (
    resourceByFirstName(firstName)?.email ??
    `${firstName.toLowerCase()}@example.com`
  );
}

/** First-names of every active person — used by @-mention parsing. */
export function activeFirstNames(): string[] {
  return RESOURCES.filter((r) => r.status === "Active").map((r) =>
    firstNameOf(r.name),
  );
}

/**
 * Parse `@firstname` mentions from free text. Matches case-insensitively
 * against the live roster so renames are picked up automatically. Returns
 * canonical first names (the casing used in the roster).
 */
export function parseMentions(body: string, roster: string[]): string[] {
  const found = new Set<string>();
  const lcRoster = new Map(roster.map((r) => [r.toLowerCase(), r]));
  const re = /@([A-Za-z][A-Za-z'-]{1,30})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const canonical = lcRoster.get(m[1].toLowerCase());
    if (canonical) found.add(canonical);
  }
  return Array.from(found);
}

/** Labour cost of a project: Σ (logged hours × that person's hourly rate). */
export function projectLaborCost(
  projectId: number,
  tasks: Task[],
  entries: TimeEntry[],
): number {
  const taskIds = new Set(
    tasks.filter((t) => t.projectId === projectId).map((t) => t.id),
  );
  let cost = 0;
  for (const e of entries) {
    if (!taskIds.has(e.taskId)) continue;
    const r = resourceByFirstName(e.person);
    cost += e.hours * (r?.hourlyRate ?? 0);
  }
  return cost;
}

export function projectStatusPill(s: ProjectStatus): string {
  switch (s) {
    case "Discovery":
      return "pill-grey";
    case "Active":
      return "pill-blue";
    case "On Hold":
      return "pill-yellow";
    case "Delivered":
      return "pill-green";
  }
}

export function performancePill(f: PerformanceFlag): {
  cls: string;
  dot: string;
} {
  switch (f) {
    case "On track":
      return { cls: "pill-green", dot: "bg-brand-green" };
    case "Watch":
      return { cls: "pill-yellow", dot: "bg-brand-yellow" };
    case "Idle":
      return { cls: "pill-red", dot: "bg-brand-red" };
  }
}
