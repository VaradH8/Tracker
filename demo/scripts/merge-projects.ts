/**
 * Merge duplicate projects into one canonical row.
 *
 * Project.name carries no unique constraint, so the same project can exist
 * twice under different capitalisation ("Enimax" and "ENIMAX"). Renaming
 * one does not fix that — it leaves two rows with the same name — so the
 * duplicates are emptied of their tasks and deleted.
 *
 * Usage (from the app container):
 *   npx tsx scripts/merge-projects.ts --token enimax --name "Thermax ENIMAX"
 *   npx tsx scripts/merge-projects.ts --token enimax --name "Thermax ENIMAX" --write
 *
 * Note the flag is opt-IN, unlike scripts/import-historical.ts where
 * --dry-run is opt-out. This one deletes rows, and the form you get by
 * forgetting a flag should not be the destructive one (CLAUDE.md rule 9).
 *
 * What moves: a task's assignees, remarks, attachments, time entries and
 * dependencies all hang off taskId rather than projectId, so reassigning
 * the project carries every one of them along. Only ProjectMember is keyed
 * on the project, and it is merged before the row goes.
 */

import { PrismaClient } from "@prisma/client";
import { describePlan, planMerge, type ProjectRow } from "../lib/merge-projects";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
function arg(name: string): string | null {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
}

const WRITE = argv.includes("--write");
const TOKEN = arg("token");
const CANONICAL = arg("name");

async function main() {
  if (!TOKEN || !CANONICAL) {
    console.error(
      'Usage: merge-projects.ts --token <substring> --name "<canonical name>" [--write]',
    );
    process.exit(1);
  }

  console.log(`\n--- merge-projects ---`);
  console.log(`Mode:      ${WRITE ? "WRITE (this deletes rows)" : "DRY RUN (no writes)"}`);
  console.log(`Matching:  names containing "${TOKEN}"`);
  console.log(`Canonical: "${CANONICAL}"\n`);

  const rows = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      clientId: true,
      _count: { select: { tasks: true } },
    },
    orderBy: { id: "asc" },
  });
  const projects: ProjectRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    clientId: r.clientId,
    taskCount: r._count.tasks,
  }));

  const plan = planMerge(projects, { canonicalName: CANONICAL, token: TOKEN });
  for (const line of describePlan(plan, CANONICAL)) console.log(`  ${line}`);

  if (!plan.keep) return;
  if (!WRITE) {
    console.log(`\nNothing written. Re-run with --write to apply.\n`);
    return;
  }
  if (plan.absorb.length === 0 && !plan.renameNeeded) {
    console.log(`\nAlready merged and correctly named — nothing to do.\n`);
    return;
  }

  const keepId = plan.keep.id;
  const absorbIds = plan.absorb.map((p) => p.id);

  // One transaction: a half-applied merge would leave tasks orphaned on a
  // project that is about to be deleted.
  await prisma.$transaction(async (tx) => {
    if (absorbIds.length > 0) {
      const moved = await tx.task.updateMany({
        where: { projectId: { in: absorbIds } },
        data: { projectId: keepId },
      });
      console.log(`  moved ${moved.count} task(s) to #${keepId}`);

      // Roster rows are keyed (projectId, userId, role), so the same person
      // in the same role on both projects would collide. skipDuplicates
      // keeps the survivor's existing rows and adds only what is new.
      const members = await tx.projectMember.findMany({
        where: { projectId: { in: absorbIds } },
        select: { userId: true, role: true },
      });
      if (members.length > 0) {
        const added = await tx.projectMember.createMany({
          data: members.map((m) => ({ projectId: keepId, userId: m.userId, role: m.role })),
          skipDuplicates: true,
        });
        console.log(`  carried over ${added.count} roster row(s)`);
      }
      await tx.projectMember.deleteMany({ where: { projectId: { in: absorbIds } } });

      // Deleting only after the tasks are demonstrably gone. If anything
      // above failed, the transaction rolls back and nothing is lost.
      const left = await tx.task.count({ where: { projectId: { in: absorbIds } } });
      if (left > 0) {
        throw new Error(`${left} task(s) still on the absorbed projects — aborting`);
      }
      const gone = await tx.project.deleteMany({ where: { id: { in: absorbIds } } });
      console.log(`  deleted ${gone.count} emptied project(s)`);
    }

    if (plan.renameNeeded) {
      await tx.project.update({ where: { id: keepId }, data: { name: CANONICAL } });
      console.log(`  renamed #${keepId} to "${CANONICAL}"`);
    }
  });

  const admin = await prisma.user.findFirst({
    where: { isAdmin: true },
    select: { id: true },
  });
  if (admin) {
    await prisma.auditEntry.create({
      data: {
        actorId: admin.id,
        action: "project.merge",
        scope: CANONICAL,
        before: plan.absorb.map((p) => `#${p.id} ${p.name}`).join(", ") || "—",
        after: `#${keepId} ${CANONICAL}`,
      },
    });
  }
  console.log(`\nDone.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
