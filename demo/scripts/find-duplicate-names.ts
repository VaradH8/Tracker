/**
 * Read-only report of user accounts that share a first name.
 *
 * Much of the UI identifies people by first name, so two accounts called
 * "Pushpalata …" get their tasks, hours and project memberships mixed up:
 * counts disagree between screens and picking "Pushpalata" in a project
 * can land on the wrong account. This lists each collision with enough
 * detail to decide which account is the real one.
 *
 * Usage (from the app container):
 *   npx tsx scripts/find-duplicate-names.ts
 *   npx tsx scripts/find-duplicate-names.ts --name Pushpalata
 *
 * Never writes to the database.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const only =
  argv.find((a) => a.startsWith("--name="))?.slice("--name=".length) ??
  (argv.includes("--name") ? argv[argv.indexOf("--name") + 1] : null);

const firstName = (n: string) => n.trim().split(/\s+/)[0].toLowerCase();

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      primaryRole: true,
      isAdmin: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
      _count: {
        select: {
          taskAssignments: true,
          projectMemberships: true,
          timeEntries: true,
          tasksResponsibleFor: true,
        },
      },
      projectMemberships: {
        select: { role: true, project: { select: { name: true } } },
      },
    },
  });

  const groups = new Map<string, typeof users>();
  for (const u of users) {
    const key = firstName(u.name);
    if (only && key !== only.toLowerCase()) continue;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }

  const dupes = [...groups.values()].filter((g) => g.length > 1);
  if (dupes.length === 0) {
    console.log("No accounts share a first name.");
    return;
  }

  for (const g of dupes) {
    console.log(`\n=== "${g[0].name.split(" ")[0]}" — ${g.length} accounts ===`);
    for (const u of g) {
      console.log(
        [
          `  ${u.name} <${u.email}>`,
          `    id=${u.id}  role=${u.primaryRole}${u.isAdmin ? " (admin)" : ""}  active=${u.isActive}`,
          `    created=${u.createdAt.toISOString().slice(0, 10)}  lastLogin=${u.lastLoginAt?.toISOString().slice(0, 10) ?? "never"}`,
          `    tasks assigned=${u._count.taskAssignments}  responsible=${u._count.tasksResponsibleFor}  time entries=${u._count.timeEntries}`,
          `    projects=${u.projectMemberships.map((m) => `${m.project.name} (${m.role})`).join(", ") || "none"}`,
        ].join("\n"),
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
