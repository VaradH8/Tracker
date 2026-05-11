export type Priority = "Critical" | "High" | "Medium" | "Low";
export type Status = "To Do" | "In Progress" | "Blocked" | "Done";
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

export type Project = {
  id: number;
  name: string;
  clientId: number;
  status: ProjectStatus;
  coordinator: string;
  bd: string;
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
};

export type Remark = {
  id: number;
  author: string;
  body: string;
  when: string;
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

  upcomingLeaveStart?: string;
  upcomingLeaveEnd?: string;
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

export const CLIENTS: Client[] = [
  {
    id: 1,
    name: "Saipem",
    industry: "Energy / Oil & Gas",
    primaryContact: "Marco Rossi",
    email: "marco.rossi@saipem.example",
    since: "2024-08-01",
  },
  {
    id: 2,
    name: "Lurgi GmbH",
    industry: "Process Engineering",
    primaryContact: "Klaus Becker",
    email: "k.becker@lurgi.example",
    since: "2025-02-15",
  },
  {
    id: 3,
    name: "Thermax",
    industry: "Energy / Boilers",
    primaryContact: "Anjali Verma",
    email: "anjali.verma@thermax.example",
    since: "2024-04-01",
  },
  {
    id: 4,
    name: "Internal",
    industry: "Internal initiatives",
    primaryContact: "Varad Hadawale",
    email: "varad@example.com",
    since: "2024-01-01",
  },
];

export const PROJECTS: Project[] = [
  {
    id: 1,
    name: "Saipem — Comment Classifier v2",
    clientId: 1,
    status: "Active",
    coordinator: "Manasi",
    bd: "Rohit",
    startDate: "2026-04-01",
    targetDate: "2026-05-30",
    budgetHours: 240,
    loggedHours: 184,
    progress: 62,
    health: "yellow",
    description:
      "Replace the rule-based comment classifier with the v2 ML model and ship the review queue UX.",
  },
  {
    id: 2,
    name: "Lurgi — Bulk Select & Filters",
    clientId: 2,
    status: "Active",
    coordinator: "Manasi",
    bd: "Rohit",
    startDate: "2026-03-15",
    targetDate: "2026-05-20",
    budgetHours: 120,
    loggedHours: 88,
    progress: 70,
    health: "green",
    description:
      "Spreadsheet-style bulk operations across the data table; resolve filter/selection edge cases.",
  },
  {
    id: 3,
    name: "Thermax — Engineering Memory v2",
    clientId: 3,
    status: "Active",
    coordinator: "Manasi",
    bd: "Rohit",
    startDate: "2026-04-15",
    targetDate: "2026-07-15",
    budgetHours: 480,
    loggedHours: 96,
    progress: 18,
    health: "green",
    description:
      "Migrate the engineering memory store to the v2 schema with backward-compat exports.",
  },
  {
    id: 4,
    name: "Thermax — P&ID Symbol Library",
    clientId: 3,
    status: "Active",
    coordinator: "Priyanka",
    bd: "Rohit",
    startDate: "2026-04-20",
    targetDate: "2026-06-10",
    budgetHours: 160,
    loggedHours: 64,
    progress: 35,
    health: "green",
    description:
      "Replace legacy P&ID symbol library with the curated, versioned set Thermax ships.",
  },
  {
    id: 5,
    name: "Thermax — ENIMAX v3 QA",
    clientId: 3,
    status: "On Hold",
    coordinator: "Kiran",
    bd: "Rohit",
    startDate: "2026-03-01",
    targetDate: "2026-05-10",
    budgetHours: 200,
    loggedHours: 152,
    progress: 50,
    health: "red",
    description:
      "Regression suite for the heat-balance calc engine; on hold pending physics review.",
  },
  {
    id: 6,
    name: "Internal — Onboarding Refresh",
    clientId: 4,
    status: "Discovery",
    coordinator: "Manasi",
    bd: "—",
    startDate: "2026-05-01",
    targetDate: "2026-06-01",
    budgetHours: 40,
    loggedHours: 4,
    progress: 5,
    health: "green",
    description: "Refresh the new-hire onboarding deck and runbook.",
  },
];

export const TASKS: Task[] = [
  {
    id: 101,
    title: "Comment Classification API — empty response on 0 results",
    description:
      "API returns 200 with `null` instead of `[]` when classifier finds no comments. Frontend crashes on `.map`.",
    projectId: 1,
    priority: "Critical",
    status: "In Progress",
    responsible: "Manasi",
    assignees: ["Manasi", "Abhishek"],
    startDate: "2026-04-30",
    targetDate: "2026-05-04",
    estimatedHours: 6,
    actualHours: 4,
    important: true,
    overdueDays: 2,
    remarks: [
      {
        id: 1,
        author: "Manasi",
        body: "@Abhishek please update — promised this for the client call.",
        when: "2h ago",
      },
      {
        id: 2,
        author: "Abhishek",
        body: "Identified — empty-result branch never gets hit. Pushing fix this afternoon.",
        when: "1h ago",
      },
    ],
  },
  {
    id: 102,
    title: "Bulk select — checkbox state desync on filter change",
    description:
      "Selected row IDs persist when user changes filter; visible rows differ. Scope selection to visible rows.",
    projectId: 2,
    priority: "High",
    status: "Blocked",
    responsible: "Manasi",
    assignees: ["Sanjana"],
    targetDate: "2026-05-04",
    estimatedHours: 4,
    important: false,
    overdueDays: 2,
    remarks: [
      {
        id: 1,
        author: "Sanjana",
        body: "Blocked — need design call on whether selection should clear on filter change.",
        when: "yesterday",
      },
    ],
  },
  {
    id: 103,
    title: "Migrate engineering memory store to v2 schema",
    projectId: 3,
    priority: "High",
    status: "To Do",
    responsible: "Manasi",
    assignees: ["Manasi", "Adil"],
    targetDate: "2026-05-12",
    estimatedHours: 16,
    important: true,
  },
  {
    id: 104,
    title: "Update onboarding deck for new hires",
    projectId: 6,
    priority: "Low",
    status: "To Do",
    responsible: "Manasi",
    assignees: ["Sanjana"],
    targetDate: "2026-05-06",
    estimatedHours: 2,
    important: false,
  },
  {
    id: 105,
    title: "Auto-tag mechanical drawings on upload",
    projectId: 1,
    priority: "Medium",
    status: "Done",
    responsible: "Manasi",
    assignees: ["Abhishek"],
    targetDate: "2026-05-02",
    estimatedHours: 5,
    actualHours: 6,
    important: false,
  },
  {
    id: 106,
    title: "Replace legacy P&ID symbol library",
    projectId: 4,
    priority: "High",
    status: "In Progress",
    responsible: "Priyanka",
    assignees: ["Priyanka"],
    targetDate: "2026-05-09",
    estimatedHours: 8,
    actualHours: 5,
    important: true,
  },
  {
    id: 107,
    title: "QA regression on heat-balance calc engine",
    projectId: 5,
    priority: "Critical",
    status: "Blocked",
    responsible: "Kiran",
    assignees: ["Kiran"],
    targetDate: "2026-05-03",
    estimatedHours: 6,
    important: true,
    overdueDays: 3,
  },
  {
    id: 108,
    title: "Spec out the QA review queue UX",
    projectId: 1,
    priority: "Medium",
    status: "To Do",
    responsible: "Manasi",
    assignees: ["Sanjana"],
    targetDate: "2026-05-08",
    estimatedHours: 3,
    important: false,
  },
];

export const RECENT_ACTIVITY = [
  { who: "Sanjana", what: "moved", target: "Bulk select bug → Blocked", when: "10m ago" },
  { who: "Abhishek", what: "added a remark on", target: "Comment Classification API", when: "1h ago" },
  { who: "Manasi", what: "marked", target: "Heat-balance regression — Important", when: "2h ago" },
  { who: "Priyanka", what: "created", target: "Replace legacy P&ID library", when: "yesterday" },
];

export const RESOURCES: Resource[] = [
  {
    id: 1,
    name: "Manasi Kulkarni",
    email: "manasi@example.com",
    phone: "+91 98200 11111",
    location: "Pune",
    joined: "2024-04-01",
    designation: "Senior Co-ordinator",
    primaryRole: "Coordinator",
    isAdmin: false,
    status: "Active",
    lastLogin: "10m ago",
    hoursLast7: 38,
    hoursLast30: 162,
    capacityPerWeek: 40,
    tasksDone30: 18,
    tasksOpen: 4,
    tasksOverdue: 1,
    estimateAccuracy: 92,
    lastStatusChange: "2h ago",
    performance: "On track",
    flags: [],
  },
  {
    id: 2,
    name: "Sanjana Rao",
    email: "sanjana@example.com",
    phone: "+91 98200 22222",
    location: "Bengaluru",
    joined: "2025-01-10",
    designation: "Developer",
    primaryRole: "Developer",
    isAdmin: false,
    status: "Active",
    lastLogin: "32m ago",
    hoursLast7: 32,
    hoursLast30: 138,
    capacityPerWeek: 40,
    tasksDone30: 11,
    tasksOpen: 3,
    tasksOverdue: 1,
    estimateAccuracy: 78,
    lastStatusChange: "10m ago",
    performance: "On track",
    flags: [],
  },
  {
    id: 3,
    name: "Abhishek Singh",
    email: "abhishek@example.com",
    phone: "+91 98200 33333",
    location: "Pune",
    joined: "2024-08-15",
    designation: "Senior Developer",
    primaryRole: "Developer",
    isAdmin: false,
    status: "Active",
    lastLogin: "1h ago",
    hoursLast7: 24,
    hoursLast30: 122,
    capacityPerWeek: 40,
    tasksDone30: 9,
    tasksOpen: 2,
    tasksOverdue: 1,
    estimateAccuracy: 65,
    lastStatusChange: "1h ago",
    performance: "Watch",
    flags: ["Estimates run ~40% over actual on last 3 tasks", "1 task overdue"],
  },
  {
    id: 4,
    name: "Adil Khan",
    email: "adil@example.com",
    phone: "+91 98200 44444",
    location: "Mumbai",
    joined: "2025-03-01",
    designation: "Developer",
    primaryRole: "Developer",
    isAdmin: false,
    status: "Active",
    lastLogin: "2h ago",
    hoursLast7: 18,
    hoursLast30: 95,
    capacityPerWeek: 40,
    tasksDone30: 6,
    tasksOpen: 1,
    tasksOverdue: 0,
    estimateAccuracy: 88,
    lastStatusChange: "5d ago",
    performance: "Idle",
    flags: [
      "No status change in 5 days",
      "Hours logged this week (18) below team median (32)",
    ],
    upcomingLeaveStart: "2026-05-15",
    upcomingLeaveEnd: "2026-05-20",
  },
  {
    id: 5,
    name: "Priyanka Joshi",
    email: "priyanka@example.com",
    phone: "+91 98200 55555",
    location: "Pune",
    joined: "2024-06-15",
    designation: "Co-ordinator",
    primaryRole: "Coordinator",
    isAdmin: false,
    status: "Active",
    lastLogin: "1h ago",
    hoursLast7: 36,
    hoursLast30: 148,
    capacityPerWeek: 40,
    tasksDone30: 14,
    tasksOpen: 3,
    tasksOverdue: 0,
    estimateAccuracy: 90,
    lastStatusChange: "1h ago",
    performance: "On track",
    flags: [],
  },
  {
    id: 6,
    name: "Kiran Patil",
    email: "kiran@example.com",
    phone: "+91 98200 66666",
    location: "Pune",
    joined: "2024-10-01",
    designation: "Co-ordinator",
    primaryRole: "Coordinator",
    isAdmin: false,
    status: "Active",
    lastLogin: "3h ago",
    hoursLast7: 22,
    hoursLast30: 110,
    capacityPerWeek: 40,
    tasksDone30: 7,
    tasksOpen: 2,
    tasksOverdue: 1,
    estimateAccuracy: 72,
    lastStatusChange: "3d ago",
    performance: "Watch",
    flags: [
      "Project on hold — limited recent activity",
      "1 critical task overdue 3 days",
    ],
  },
  {
    id: 7,
    name: "Rohit Mehra",
    email: "rohit@example.com",
    phone: "+91 98200 77777",
    location: "Mumbai",
    joined: "2024-05-15",
    designation: "Business Developer",
    primaryRole: "BusinessDeveloper",
    isAdmin: false,
    status: "Active",
    lastLogin: "yesterday",
    hoursLast7: 30,
    hoursLast30: 132,
    capacityPerWeek: 40,
    tasksDone30: 5,
    tasksOpen: 0,
    tasksOverdue: 0,
    estimateAccuracy: 100,
    lastStatusChange: "yesterday",
    performance: "On track",
    flags: [],
  },
  {
    id: 8,
    name: "Varad Hadawale",
    email: "varad@example.com",
    phone: "+91 98200 88888",
    location: "Pune",
    joined: "2024-01-01",
    designation: "Founder / Admin",
    primaryRole: "Admin",
    isAdmin: true,
    status: "Active",
    lastLogin: "just now",
    hoursLast7: 40,
    hoursLast30: 168,
    capacityPerWeek: 40,
    tasksDone30: 0,
    tasksOpen: 0,
    tasksOverdue: 0,
    estimateAccuracy: 100,
    lastStatusChange: "—",
    performance: "On track",
    flags: [],
  },
];

export const LEAVES: LeaveEntry[] = [
  {
    id: 1,
    resourceName: "Adil Khan",
    start: "2026-05-15",
    end: "2026-05-20",
    type: "Vacation",
    note: "Family wedding",
    approved: true,
  },
  {
    id: 2,
    resourceName: "Sanjana Rao",
    start: "2026-05-09",
    end: "2026-05-09",
    type: "WFH",
    approved: true,
  },
  {
    id: 3,
    resourceName: "Kiran Patil",
    start: "2026-05-22",
    end: "2026-05-23",
    type: "Personal",
    approved: false,
  },
  {
    id: 4,
    resourceName: "Abhishek Singh",
    start: "2026-06-01",
    end: "2026-06-05",
    type: "Vacation",
    approved: false,
  },
];

export const AUDIT_LOG: AuditEntry[] = [
  {
    id: 1,
    when: "10m ago",
    actor: "Sanjana Rao",
    action: "task.status_change",
    scope: "Lurgi — Bulk Select & Filters",
    taskTitle: "Bulk select — checkbox desync",
    before: "In Progress",
    after: "Blocked",
  },
  {
    id: 2,
    when: "2h ago",
    actor: "Manasi Kulkarni",
    action: "task.mark_important",
    scope: "Thermax — ENIMAX v3 QA",
    taskTitle: "Heat-balance regression",
    before: "false",
    after: "true",
  },
  {
    id: 3,
    when: "1h ago",
    actor: "Manasi Kulkarni",
    action: "task.reassign",
    scope: "Thermax — Engineering Memory v2",
    taskTitle: "Migrate engg memory store",
    before: "Manasi",
    after: "Manasi, Adil",
  },
  {
    id: 4,
    when: "yesterday",
    actor: "Varad Hadawale",
    action: "user.invite",
    scope: "—",
    taskTitle: "kiran@example.com",
  },
  {
    id: 5,
    when: "2d ago",
    actor: "Rohit Mehra",
    action: "project.create",
    scope: "Internal — Onboarding Refresh",
  },
  {
    id: 6,
    when: "3d ago",
    actor: "Varad Hadawale",
    action: "user.role_change",
    scope: "—",
    taskTitle: "kiran@example.com",
    before: "Developer",
    after: "Coordinator",
  },
];

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
  name: "Sanjana Rao",
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
    case "Done":
      return "pill-green";
  }
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
