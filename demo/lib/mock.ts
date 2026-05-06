export type Priority = "Critical" | "High" | "Medium" | "Low";
export type Status = "To Do" | "In Progress" | "Blocked" | "Done";

export type Task = {
  id: number;
  title: string;
  description?: string;
  project: string;
  team: string;
  priority: Priority;
  status: Status;
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

export type TeamSummary = {
  name: string;
  manager: string;
  active: number;
  overdue: number;
  important: number;
  members: number;
  projects: number;
  lastActivity: string;
  status: "Active" | "Archived";
};

export type UserRow = {
  id: number;
  name: string;
  email: string;
  rolesByTeam: { team: string; role: "Manager" | "User" }[];
  isAdmin: boolean;
  lastLogin: string;
  status: "Active" | "Deactivated";
};

export type AuditEntry = {
  id: number;
  when: string;
  actor: string;
  action: string;
  team: string;
  taskTitle?: string;
  before?: string;
  after?: string;
};

export const TEAMS = [
  "Samanvay – Engg Memory",
  "Thermax P&ID",
  "Thermax ENIMAX",
  "AMC",
];

export const TASKS: Task[] = [
  {
    id: 101,
    title: "Comment Classification API — empty response on 0 results",
    description:
      "API returns 200 with `null` instead of `[]` when classifier finds no comments. Frontend crashes on `.map`.",
    project: "Saipem",
    team: "Samanvay – Engg Memory",
    priority: "Critical",
    status: "In Progress",
    assignees: ["Manasi", "Abhishek"],
    startDate: "2026-04-30",
    targetDate: "2026-05-04",
    estimatedHours: 6,
    important: true,
    overdueDays: 1,
    remarks: [
      {
        id: 1,
        author: "Manasi",
        body: "@Abhishek please update — promised this for the demo.",
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
    project: "Lurgi",
    team: "Samanvay – Engg Memory",
    priority: "High",
    status: "Blocked",
    assignees: ["Sanjana"],
    targetDate: "2026-05-04",
    estimatedHours: 4,
    important: false,
    overdueDays: 1,
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
    project: "Thermax",
    team: "Samanvay – Engg Memory",
    priority: "High",
    status: "To Do",
    assignees: ["Manasi", "Adil"],
    targetDate: "2026-05-05",
    estimatedHours: 16,
    important: true,
  },
  {
    id: 104,
    title: "Update onboarding deck for new hires",
    project: "Internal",
    team: "Samanvay – Engg Memory",
    priority: "Low",
    status: "To Do",
    assignees: ["Sanjana"],
    targetDate: "2026-05-05",
    estimatedHours: 2,
    important: false,
  },
  {
    id: 105,
    title: "Auto-tag mechanical drawings on upload",
    project: "Saipem",
    team: "Samanvay – Engg Memory",
    priority: "Medium",
    status: "Done",
    assignees: ["Abhishek"],
    targetDate: "2026-05-02",
    estimatedHours: 5,
    actualHours: 6,
    important: false,
  },
  {
    id: 106,
    title: "Replace legacy P&ID symbol library",
    project: "Boiler Skid",
    team: "Thermax P&ID",
    priority: "High",
    status: "In Progress",
    assignees: ["Priyanka"],
    targetDate: "2026-05-09",
    estimatedHours: 8,
    important: true,
  },
  {
    id: 107,
    title: "QA regression on heat-balance calc engine",
    project: "ENIMAX v3",
    team: "Thermax ENIMAX",
    priority: "Critical",
    status: "Blocked",
    assignees: ["Kiran"],
    targetDate: "2026-05-03",
    estimatedHours: 6,
    important: true,
    overdueDays: 2,
  },
  {
    id: 108,
    title: "Spec out the QA review queue UX",
    project: "Saipem",
    team: "Samanvay – Engg Memory",
    priority: "Medium",
    status: "To Do",
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

export const TEAM_SUMMARIES: TeamSummary[] = [
  { name: "Samanvay – Engg Memory", manager: "Manasi", active: 5, overdue: 2, important: 2, members: 4, projects: 4, lastActivity: "10m ago", status: "Active" },
  { name: "Thermax P&ID", manager: "Priyanka", active: 1, overdue: 0, important: 1, members: 2, projects: 1, lastActivity: "1h ago", status: "Active" },
  { name: "Thermax ENIMAX", manager: "Kiran", active: 1, overdue: 1, important: 1, members: 2, projects: 1, lastActivity: "3h ago", status: "Active" },
  { name: "AMC", manager: "Neha", active: 0, overdue: 0, important: 0, members: 1, projects: 1, lastActivity: "2d ago", status: "Active" },
];

export const USERS: UserRow[] = [
  {
    id: 1,
    name: "Manasi Kulkarni",
    email: "manasi@example.com",
    rolesByTeam: [{ team: "Samanvay – Engg Memory", role: "Manager" }],
    isAdmin: false,
    lastLogin: "10m ago",
    status: "Active",
  },
  {
    id: 2,
    name: "Sanjana Rao",
    email: "sanjana@example.com",
    rolesByTeam: [{ team: "Samanvay – Engg Memory", role: "User" }],
    isAdmin: false,
    lastLogin: "32m ago",
    status: "Active",
  },
  {
    id: 3,
    name: "Abhishek Singh",
    email: "abhishek@example.com",
    rolesByTeam: [{ team: "Samanvay – Engg Memory", role: "User" }],
    isAdmin: false,
    lastLogin: "1h ago",
    status: "Active",
  },
  {
    id: 4,
    name: "Adil Khan",
    email: "adil@example.com",
    rolesByTeam: [{ team: "Samanvay – Engg Memory", role: "User" }],
    isAdmin: false,
    lastLogin: "2h ago",
    status: "Active",
  },
  {
    id: 5,
    name: "Priyanka Joshi",
    email: "priyanka@example.com",
    rolesByTeam: [{ team: "Thermax P&ID", role: "Manager" }],
    isAdmin: false,
    lastLogin: "1h ago",
    status: "Active",
  },
  {
    id: 6,
    name: "Kiran Patil",
    email: "kiran@example.com",
    rolesByTeam: [{ team: "Thermax ENIMAX", role: "Manager" }],
    isAdmin: false,
    lastLogin: "3h ago",
    status: "Active",
  },
  {
    id: 7,
    name: "Varad Hadawale",
    email: "varad@example.com",
    rolesByTeam: [],
    isAdmin: true,
    lastLogin: "just now",
    status: "Active",
  },
  {
    id: 8,
    name: "Old Account",
    email: "old@example.com",
    rolesByTeam: [{ team: "AMC", role: "User" }],
    isAdmin: false,
    lastLogin: "3 months ago",
    status: "Deactivated",
  },
];

export const AUDIT_LOG: AuditEntry[] = [
  {
    id: 1,
    when: "10m ago",
    actor: "Sanjana Rao",
    action: "task.status_change",
    team: "Samanvay – Engg Memory",
    taskTitle: "Bulk select — checkbox desync",
    before: "In Progress",
    after: "Blocked",
  },
  {
    id: 2,
    when: "2h ago",
    actor: "Manasi Kulkarni",
    action: "task.mark_important",
    team: "Thermax ENIMAX",
    taskTitle: "Heat-balance regression",
    before: "false",
    after: "true",
  },
  {
    id: 3,
    when: "1h ago",
    actor: "Manasi Kulkarni",
    action: "task.reassign",
    team: "Samanvay – Engg Memory",
    taskTitle: "Migrate engg memory store",
    before: "Manasi",
    after: "Manasi, Adil",
  },
  {
    id: 4,
    when: "yesterday",
    actor: "Varad Hadawale",
    action: "user.invite",
    team: "—",
    taskTitle: "kiran@example.com",
  },
  {
    id: 5,
    when: "2d ago",
    actor: "Varad Hadawale",
    action: "team.create",
    team: "AMC",
  },
];

export const CURRENT_USER = {
  name: "Manasi Kulkarni",
  firstName: "Manasi",
  email: "manasi@example.com",
  team: "Samanvay – Engg Memory",
};

export const ADMIN_USER = {
  name: "Varad Hadawale",
  firstName: "Varad",
  email: "varad@example.com",
};

export const USER_USER = {
  name: "Sanjana Rao",
  firstName: "Sanjana",
  email: "sanjana@example.com",
  team: "Samanvay – Engg Memory",
};

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
