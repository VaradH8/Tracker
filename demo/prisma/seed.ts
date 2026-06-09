import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "tracker2026";

type UserSeed = {
  email: string;
  name: string;
  primaryRole: "Admin" | "Coordinator" | "BusinessDeveloper" | "Developer";
  isAdmin: boolean;
  designation: string;
  phone: string;
  location: string;
  joined: string;
  hourlyRate: number;
  hoursLast7: number;
  hoursLast30: number;
  capacityPerWeek: number;
  tasksDone30: number;
  estimateAccuracy: number;
  performance: "On track" | "Watch" | "Idle";
  flags: string[];
};

const USERS: UserSeed[] = [
  { email: "varad@example.com", name: "Varad Hadawale", primaryRole: "Admin", isAdmin: true, designation: "Founder / Admin", phone: "+91 98200 88888", location: "Pune", joined: "2024-01-01", hourlyRate: 2500, hoursLast7: 40, hoursLast30: 168, capacityPerWeek: 40, tasksDone30: 0, estimateAccuracy: 100, performance: "On track", flags: [] },
  { email: "manasi@example.com", name: "Manasi Kulkarni", primaryRole: "Coordinator", isAdmin: false, designation: "Senior Co-ordinator", phone: "+91 98200 11111", location: "Pune", joined: "2024-04-01", hourlyRate: 1800, hoursLast7: 38, hoursLast30: 162, capacityPerWeek: 40, tasksDone30: 18, estimateAccuracy: 92, performance: "On track", flags: [] },
  { email: "priyanka@example.com", name: "Priyanka Joshi", primaryRole: "Coordinator", isAdmin: false, designation: "Co-ordinator", phone: "+91 98200 55555", location: "Pune", joined: "2024-06-15", hourlyRate: 1500, hoursLast7: 36, hoursLast30: 148, capacityPerWeek: 40, tasksDone30: 14, estimateAccuracy: 90, performance: "On track", flags: [] },
  { email: "kiran@example.com", name: "Kiran Patil", primaryRole: "Coordinator", isAdmin: false, designation: "Co-ordinator", phone: "+91 98200 66666", location: "Pune", joined: "2024-10-01", hourlyRate: 1500, hoursLast7: 22, hoursLast30: 110, capacityPerWeek: 40, tasksDone30: 7, estimateAccuracy: 72, performance: "Watch", flags: ["Project on hold — limited recent activity", "1 critical task overdue 3 days"] },
  { email: "rohit@example.com", name: "Rohit Mehra", primaryRole: "BusinessDeveloper", isAdmin: false, designation: "Business Developer", phone: "+91 98200 77777", location: "Mumbai", joined: "2024-05-15", hourlyRate: 1600, hoursLast7: 30, hoursLast30: 132, capacityPerWeek: 40, tasksDone30: 5, estimateAccuracy: 100, performance: "On track", flags: [] },
  { email: "sanjana@example.com", name: "Sanjana Jadhav", primaryRole: "Developer", isAdmin: false, designation: "Developer", phone: "+91 98200 22222", location: "Bengaluru", joined: "2025-01-10", hourlyRate: 1400, hoursLast7: 32, hoursLast30: 138, capacityPerWeek: 40, tasksDone30: 11, estimateAccuracy: 78, performance: "On track", flags: [] },
  { email: "abhishek@example.com", name: "Abhishek Singh", primaryRole: "Developer", isAdmin: false, designation: "Senior Developer", phone: "+91 98200 33333", location: "Pune", joined: "2024-08-15", hourlyRate: 1600, hoursLast7: 24, hoursLast30: 122, capacityPerWeek: 40, tasksDone30: 9, estimateAccuracy: 65, performance: "Watch", flags: ["Estimates run ~40% over actual on last 3 tasks", "1 task overdue"] },
  { email: "adil@example.com", name: "Adil Khan", primaryRole: "Developer", isAdmin: false, designation: "Developer", phone: "+91 98200 44444", location: "Mumbai", joined: "2025-03-01", hourlyRate: 1300, hoursLast7: 18, hoursLast30: 95, capacityPerWeek: 40, tasksDone30: 6, estimateAccuracy: 88, performance: "Idle", flags: ["No status change in 5 days", "Hours logged this week (18) below team median (32)"] },
];

const CLIENTS = [
  { name: "Saipem", industry: "Energy / Oil & Gas", primaryContact: "Marco Rossi", email: "marco.rossi@saipem.example", since: "2024-08-01" },
  { name: "Lurgi GmbH", industry: "Process Engineering", primaryContact: "Klaus Becker", email: "k.becker@lurgi.example", since: "2025-02-15" },
  { name: "Thermax", industry: "Energy / Boilers", primaryContact: "Anjali Verma", email: "anjali.verma@thermax.example", since: "2024-04-01" },
  { name: "Internal", industry: "Internal initiatives", primaryContact: "Varad Hadawale", email: "varad@example.com", since: "2024-01-01" },
];

const PROJECTS = [
  { name: "Saipem — Comment Classifier v2", clientName: "Saipem", status: "Active", coordinatorName: "Manasi", bdName: "Rohit", leadFirstName: "Varad", teamFirstNames: ["Manasi", "Abhishek", "Sanjana"], startDate: "2026-04-01", targetDate: "2026-05-30", budgetHours: 240, loggedHours: 184, progress: 62, health: "yellow", description: "Replace the rule-based comment classifier with the v2 ML model." },
  { name: "Lurgi — Bulk Select & Filters", clientName: "Lurgi GmbH", status: "Active", coordinatorName: "Manasi", bdName: "Rohit", leadFirstName: "Varad", teamFirstNames: ["Sanjana"], startDate: "2026-03-15", targetDate: "2026-05-20", budgetHours: 120, loggedHours: 88, progress: 70, health: "green", description: "Spreadsheet-style bulk operations across the data table." },
  { name: "Thermax — Engineering Memory v2", clientName: "Thermax", status: "Active", coordinatorName: "Manasi", bdName: "Rohit", leadFirstName: "Varad", teamFirstNames: ["Manasi", "Adil"], startDate: "2026-04-15", targetDate: "2026-07-15", budgetHours: 480, loggedHours: 96, progress: 18, health: "green", description: "Migrate the engineering memory store to the v2 schema." },
  { name: "Thermax — P&ID Symbol Library", clientName: "Thermax", status: "Active", coordinatorName: "Priyanka", bdName: "Rohit", leadFirstName: "Varad", teamFirstNames: ["Priyanka"], startDate: "2026-04-20", targetDate: "2026-06-10", budgetHours: 160, loggedHours: 64, progress: 35, health: "green", description: "Replace legacy P&ID symbol library." },
  { name: "Thermax — ENIMAX v3 QA", clientName: "Thermax", status: "On Hold", coordinatorName: "Kiran", bdName: "Rohit", leadFirstName: "Varad", teamFirstNames: ["Kiran"], startDate: "2026-03-01", targetDate: "2026-05-10", budgetHours: 200, loggedHours: 152, progress: 50, health: "red", description: "Regression suite for the heat-balance calc engine; on hold pending physics review." },
  { name: "Internal — Onboarding Refresh", clientName: "Internal", status: "Discovery", coordinatorName: "Manasi", bdName: "—", leadFirstName: "Varad", teamFirstNames: ["Sanjana"], startDate: "2026-05-01", targetDate: "2026-06-01", budgetHours: 40, loggedHours: 4, progress: 5, health: "green", description: "Refresh the new-hire onboarding deck and runbook." },
];

type TaskSeed = {
  title: string;
  description?: string;
  projectName: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  status: "To Do" | "In Progress" | "Blocked" | "Done";
  responsibleFirstName: string; // Person Responsible — the assigner
  assigneeFirstNames: string[]; // Person Accountable — the doers
  startDate?: string;
  targetDate: string;
  estimatedHours?: number;
  actualHours?: number;
  important: boolean;
  approvedByFirstName?: string;
  approvedAtIso?: string;
  remarks?: { authorFirstName: string; body: string; offsetMinutes: number }[];
};

const TASKS: TaskSeed[] = [
  { title: "Comment Classification API — empty response on 0 results", description: "API returns 200 with `null` instead of `[]`. Frontend crashes on `.map`.", projectName: "Saipem — Comment Classifier v2", priority: "Critical", status: "In Progress", responsibleFirstName: "Manasi", assigneeFirstNames: ["Manasi", "Abhishek"], startDate: "2026-04-30", targetDate: "2026-05-04", estimatedHours: 6, actualHours: 4, important: true, remarks: [{ authorFirstName: "Manasi", body: "@Abhishek please update — promised this for the client call.", offsetMinutes: -120 }, { authorFirstName: "Abhishek", body: "Identified — empty-result branch never gets hit. Pushing fix this afternoon.", offsetMinutes: -60 }] },
  { title: "Bulk select — checkbox state desync on filter change", description: "Selected row IDs persist when user changes filter; visible rows differ.", projectName: "Lurgi — Bulk Select & Filters", priority: "High", status: "Blocked", responsibleFirstName: "Manasi", assigneeFirstNames: ["Sanjana"], targetDate: "2026-05-04", estimatedHours: 4, important: false, remarks: [{ authorFirstName: "Sanjana", body: "Blocked — need design call on whether selection should clear on filter change.", offsetMinutes: -1440 }] },
  { title: "Migrate engineering memory store to v2 schema", projectName: "Thermax — Engineering Memory v2", priority: "High", status: "To Do", responsibleFirstName: "Manasi", assigneeFirstNames: ["Manasi", "Adil"], targetDate: "2026-05-12", estimatedHours: 16, important: true },
  { title: "Update onboarding deck for new hires", projectName: "Internal — Onboarding Refresh", priority: "Low", status: "To Do", responsibleFirstName: "Manasi", assigneeFirstNames: ["Sanjana"], targetDate: "2026-05-06", estimatedHours: 2, important: false },
  { title: "Auto-tag mechanical drawings on upload", projectName: "Saipem — Comment Classifier v2", priority: "Medium", status: "Done", responsibleFirstName: "Manasi", assigneeFirstNames: ["Abhishek"], targetDate: "2026-05-02", estimatedHours: 5, actualHours: 6, important: false, approvedByFirstName: "Manasi", approvedAtIso: "2026-05-03" },
  { title: "Replace legacy P&ID symbol library", projectName: "Thermax — P&ID Symbol Library", priority: "High", status: "In Progress", responsibleFirstName: "Priyanka", assigneeFirstNames: ["Priyanka"], targetDate: "2026-05-09", estimatedHours: 8, actualHours: 5, important: true },
  { title: "QA regression on heat-balance calc engine", projectName: "Thermax — ENIMAX v3 QA", priority: "Critical", status: "Blocked", responsibleFirstName: "Kiran", assigneeFirstNames: ["Kiran"], targetDate: "2026-05-03", estimatedHours: 6, important: true },
  { title: "Spec out the QA review queue UX", projectName: "Saipem — Comment Classifier v2", priority: "Medium", status: "To Do", responsibleFirstName: "Manasi", assigneeFirstNames: ["Sanjana"], targetDate: "2026-05-08", estimatedHours: 3, important: false },
];

const LEAVES = [
  { userFirstName: "Adil", start: "2026-05-15", end: "2026-05-20", type: "Vacation", note: "Family wedding", approved: true },
  { userFirstName: "Sanjana", start: "2026-05-09", end: "2026-05-09", type: "WFH", note: null, approved: true },
  { userFirstName: "Kiran", start: "2026-05-22", end: "2026-05-23", type: "Personal", note: null, approved: false },
  { userFirstName: "Abhishek", start: "2026-06-01", end: "2026-06-05", type: "Vacation", note: null, approved: false },
];

const AUDIT = [
  { actorEmail: "sanjana@example.com", action: "task.status_change", scope: "Lurgi — Bulk Select & Filters", taskTitle: "Bulk select — checkbox state desync on filter change", before: "In Progress", after: "Blocked", offsetMinutes: -10 },
  { actorEmail: "manasi@example.com", action: "task.mark_important", scope: "Thermax — ENIMAX v3 QA", taskTitle: "QA regression on heat-balance calc engine", before: "false", after: "true", offsetMinutes: -120 },
  { actorEmail: "manasi@example.com", action: "task.reassign", scope: "Thermax — Engineering Memory v2", taskTitle: "Migrate engineering memory store to v2 schema", before: "Manasi", after: "Manasi, Adil", offsetMinutes: -60 },
  { actorEmail: "varad@example.com", action: "user.invite", scope: null, taskTitle: "kiran@example.com", before: null, after: null, offsetMinutes: -1440 },
  { actorEmail: "rohit@example.com", action: "project.create", scope: "Internal — Onboarding Refresh", taskTitle: null, before: null, after: null, offsetMinutes: -2880 },
  { actorEmail: "varad@example.com", action: "user.role_change", scope: null, taskTitle: "kiran@example.com", before: "Developer", after: "Coordinator", offsetMinutes: -4320 },
];

async function main() {
  console.log("Wiping existing data…");
  await prisma.emailLog.deleteMany();
  await prisma.auditEntry.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.remark.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.taskAttachment.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.pipelineDeal.deleteMany();
  await prisma.client.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  console.log("Seeding users…");
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const userByEmail: Record<string, string> = {};
  const userByFirst: Record<string, string> = {};
  for (const u of USERS) {
    const created = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        primaryRole: u.primaryRole,
        isAdmin: u.isAdmin,
        designation: u.designation,
        phone: u.phone,
        location: u.location,
        joined: new Date(u.joined),
        hourlyRate: u.hourlyRate,
        hoursLast7: u.hoursLast7,
        hoursLast30: u.hoursLast30,
        capacityPerWeek: u.capacityPerWeek,
        tasksDone30: u.tasksDone30,
        estimateAccuracy: u.estimateAccuracy,
        performance: u.performance,
        flags: JSON.stringify(u.flags),
      },
    });
    userByEmail[u.email] = created.id;
    userByFirst[u.name.split(" ")[0]] = created.id;
  }

  console.log("Seeding clients…");
  const clientByName: Record<string, number> = {};
  for (const c of CLIENTS) {
    const created = await prisma.client.create({
      data: {
        name: c.name,
        industry: c.industry,
        primaryContact: c.primaryContact,
        email: c.email,
        since: new Date(c.since),
      },
    });
    clientByName[c.name] = created.id;
  }

  console.log("Seeding projects + team members…");
  const projectByName: Record<string, number> = {};
  for (const p of PROJECTS) {
    const leadId = userByFirst[p.leadFirstName] ?? null;
    const created = await prisma.project.create({
      data: {
        name: p.name,
        clientId: clientByName[p.clientName],
        status: p.status,
        coordinatorName: p.coordinatorName,
        bdName: p.bdName,
        leadId,
        startDate: new Date(p.startDate),
        targetDate: new Date(p.targetDate),
        budgetHours: p.budgetHours,
        loggedHours: p.loggedHours,
        progress: p.progress,
        health: p.health,
        description: p.description,
      },
    });
    projectByName[p.name] = created.id;
    for (const first of p.teamFirstNames) {
      const userId = userByFirst[first];
      if (!userId) continue;
      await prisma.projectMember.create({
        data: { projectId: created.id, userId },
      });
    }
  }

  console.log("Seeding tasks + assignees + remarks…");
  const now = new Date();
  for (const t of TASKS) {
    const responsibleId = userByFirst[t.responsibleFirstName] ?? null;
    const approvedById = t.approvedByFirstName
      ? (userByFirst[t.approvedByFirstName] ?? null)
      : null;
    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        projectId: projectByName[t.projectName],
        priority: t.priority,
        status: t.status,
        startDate: t.startDate ? new Date(t.startDate) : null,
        targetDate: new Date(t.targetDate),
        estimatedHours: t.estimatedHours,
        actualHours: t.actualHours,
        important: t.important,
        responsibleId,
        approvedById,
        approvedAt: t.approvedAtIso ? new Date(t.approvedAtIso) : null,
      },
    });
    for (const first of t.assigneeFirstNames) {
      const userId = userByFirst[first];
      if (!userId) continue;
      await prisma.taskAssignee.create({
        data: { taskId: task.id, userId },
      });
    }
    for (const r of t.remarks ?? []) {
      const authorId = userByFirst[r.authorFirstName];
      if (!authorId) continue;
      await prisma.remark.create({
        data: {
          taskId: task.id,
          authorId,
          body: r.body,
          createdAt: new Date(now.getTime() + r.offsetMinutes * 60 * 1000),
        },
      });
    }
  }

  console.log("Seeding leaves…");
  for (const l of LEAVES) {
    const userId = userByFirst[l.userFirstName];
    if (!userId) continue;
    await prisma.leave.create({
      data: {
        userId,
        start: new Date(l.start),
        end: new Date(l.end),
        type: l.type,
        note: l.note,
        approved: l.approved,
      },
    });
  }

  console.log("Seeding audit log…");
  for (const a of AUDIT) {
    const actorId = userByEmail[a.actorEmail];
    if (!actorId) continue;
    await prisma.auditEntry.create({
      data: {
        actorId,
        action: a.action,
        scope: a.scope,
        taskTitle: a.taskTitle,
        before: a.before,
        after: a.after,
        createdAt: new Date(now.getTime() + a.offsetMinutes * 60 * 1000),
      },
    });
  }

  console.log("\n✅ Seed complete.");
  console.log(`   ${USERS.length} users · ${CLIENTS.length} clients · ${PROJECTS.length} projects · ${TASKS.length} tasks`);
  console.log(`   Default password for all seeded users: "${DEFAULT_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
