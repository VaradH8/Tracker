/**
 * Import a hand-written work log — "these tasks, this person, these dates".
 *
 * Usage (from the app container):
 *   npx tsx scripts/import-work-log.ts --file /import/worklog.json
 *   npx tsx scripts/import-work-log.ts --file /import/worklog.json --write
 *
 * The flag is opt-IN: the form you get by forgetting it reads and reports,
 * and writes nothing. The dry run is the review step — it names every
 * client and project it would create and every person it could not match,
 * so nothing appears in production that you have not already seen listed.
 *
 * Creating a project is the one thing this does beyond tasks, and only
 * because a work log spans projects that may not exist yet. Everything
 * else — matching a task by title, resolving people, stamping completedAt,
 * staying idempotent — is lib/import/tasks.ts, unchanged and already tested.
 */

import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { commitTaskRows } from "../lib/import/tasks";
import { countTasks, toGroupedRows, type WorkLog } from "../lib/import/work-log";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
function arg(name: string): string | null {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
}

const WRITE = argv.includes("--write");
const FILE = arg("file");

/** Placeholder ids for the dry run, so nothing is created to report on. */
let pretendId = -1;

async function ensureClient(name: string): Promise<{ id: number; created: boolean }> {
  const found = await prisma.client.findFirst({ where: { name }, select: { id: true } });
  if (found) return { id: found.id, created: false };
  if (!WRITE) return { id: pretendId--, created: true };
  const made = await prisma.client.create({
    data: {
      name,
      industry: "Engineering / Automation",
      primaryContact: "—",
      email: "",
      since: new Date(),
    },
    select: { id: true },
  });
  return { id: made.id, created: true };
}

async function ensureProject(args: {
  clientId: number;
  name: string;
  startDate: Date;
  targetDate: Date;
}): Promise<{ id: number; created: boolean }> {
  const { clientId, name, startDate, targetDate } = args;
  if (clientId >= 0) {
    const found = await prisma.project.findFirst({
      where: { clientId, name },
      select: { id: true },
    });
    if (found) return { id: found.id, created: false };
  }
  if (!WRITE) return { id: pretendId--, created: true };
  const made = await prisma.project.create({
    data: {
      name,
      clientId,
      status: "Active",
      startDate,
      targetDate,
      budgetHours: 0,
    },
    select: { id: true },
  });
  return { id: made.id, created: true };
}

async function main() {
  if (!FILE) {
    console.error("Usage: import-work-log.ts --file <path-to-json> [--write]");
    process.exit(1);
  }
  if (!fs.existsSync(FILE)) {
    console.error(`File not found: ${FILE}`);
    process.exit(1);
  }

  const log = JSON.parse(fs.readFileSync(FILE, "utf-8")) as WorkLog;
  if (!Array.isArray(log.groups) || log.groups.length === 0) {
    console.error("That file has no groups.");
    process.exit(1);
  }

  console.log(`\n--- import-work-log ---`);
  console.log(`Mode:  ${WRITE ? "WRITE" : "DRY RUN (no writes)"}`);
  console.log(`File:  ${FILE}`);
  console.log(`Tasks: ${countTasks(log)} across ${log.groups.length} group(s)\n`);

  const actor = await prisma.user.findFirst({
    where: { isAdmin: true },
    select: { id: true },
  });
  if (!actor) {
    console.error("No admin user to attribute the import to. Aborting.");
    process.exit(1);
  }

  // Throws on a bad date or an empty title, before anything is written.
  const grouped = toGroupedRows(log);

  const unmatched = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const { group, rows } of grouped) {
    const days = rows.flatMap((r) =>
      [r.startDate, r.completedAt].filter((d): d is Date => d != null),
    );
    const startDate = new Date(Math.min(...days.map((d) => d.getTime())));
    const targetDate = new Date(Math.max(...days.map((d) => d.getTime())));

    const client = await ensureClient(group.client);
    const project = await ensureProject({
      clientId: client.id,
      name: group.project,
      startDate,
      targetDate,
    });

    const { stats, unmatchedNames } = await commitTaskRows(
      prisma,
      project.id,
      rows,
      { dryRun: !WRITE, actorId: actor.id },
    );
    unmatchedNames.forEach((n) => unmatched.add(n));
    created += stats.tasksCreated;
    updated += stats.tasksUpdated;

    const note = [
      client.created ? `client "${group.client}" NEW` : null,
      project.created ? `project NEW` : `project reused`,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `  ${group.project.padEnd(20)} ${String(rows.length).padStart(2)} task(s) → ` +
        `${stats.tasksCreated} new, ${stats.tasksUpdated} updated  (${note})`,
    );
  }

  console.log(`\n  ${created} created, ${updated} updated.`);
  if (unmatched.size > 0) {
    console.log(
      `  ! Unmatched people (their tasks import UNASSIGNED): ${Array.from(unmatched).sort().join(", ")}`,
    );
    console.log(`    Add them under People first if that is not what you want.`);
  }

  if (!WRITE) {
    console.log(`\nNothing written. Re-run with --write to apply.\n`);
    return;
  }

  await prisma.auditEntry.create({
    data: {
      actorId: actor.id,
      action: "import.work-log",
      scope: FILE,
      after: `${created} created, ${updated} updated`,
    },
  });
  console.log(`\nDone.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
