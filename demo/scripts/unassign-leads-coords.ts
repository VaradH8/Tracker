/**
 * One-off cleanup: take Leads and Co-ordinators off the tasks they were
 * assigned to.
 *
 * Tasks are assigned to Developers only (see the task form and the
 * assignee picker). Leads and Co-ordinators see every task on the
 * projects they run without being assigned — an assignment only put the
 * task on their My Tasks. This removes the TaskAssignee rows that
 * pre-date that rule. Nothing else about a task is touched: the task, its
 * other assignees, its responsible owner and its history all stay.
 *
 * Usage (from the app container):
 *   npx tsx scripts/unassign-leads-coords.ts                       # dry run
 *   npx tsx scripts/unassign-leads-coords.ts --apply               # remove for real
 *   npx tsx scripts/unassign-leads-coords.ts --apply --actor=you@example.com
 *
 * Dry run is the default — nothing is written unless --apply is given.
 * --actor=<email> records a "task.reassign" audit entry per task, attributed
 *   to that account, so the change shows on the Audit page. Without it the
 *   removal is only reported here.
 * --roles=Lead,Coordinator picks which global roles to take off (that's the
 *   default). Assignees in other non-Developer roles (Admin, HR, BD) are
 *   listed for information and left alone.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const flag = (name: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const ACTOR_EMAIL = flag("actor");
const ROLES = (flag("roles") ?? "Lead,Coordinator")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

async function main() {
  console.log(`\n--- unassign-leads-coords ---`);
  console.log(`Mode: ${APPLY ? "APPLY (deletes assignments)" : "DRY RUN (no DB writes)"}`);
  console.log(`Removing assignees whose role is: ${ROLES.join(", ")}\n`);

  // Resolve the audit actor up front so a typo can't leave us half-done.
  let actorId: string | null = null;
  if (ACTOR_EMAIL) {
    const actor = await prisma.user.findUnique({
      where: { email: ACTOR_EMAIL },
      select: { id: true, name: true },
    });
    if (!actor) {
      console.error(`No account with email ${ACTOR_EMAIL} — nothing changed.`);
      process.exit(1);
    }
    actorId = actor.id;
    console.log(`Audit entries will be attributed to ${actor.name}.\n`);
  }

  const rows = await prisma.taskAssignee.findMany({
    where: { user: { primaryRole: { in: ROLES } } },
    include: {
      user: { select: { name: true, primaryRole: true } },
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { name: true } },
          assignees: { select: { userId: true, user: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ task: { project: { name: "asc" } } }, { taskId: "asc" }],
  });

  if (rows.length === 0) {
    console.log("No Lead/Co-ordinator assignments found. Nothing to do.");
  } else {
    console.log(`${rows.length} assignment(s) to remove:\n`);
    for (const r of rows) {
      console.log(
        `  #${r.taskId}  ${r.task.project.name}  —  ${r.task.title}\n` +
          `        ${r.user.name} (${r.user.primaryRole})`,
      );
    }
  }

  // For information only: anyone else on a task who isn't a Developer.
  const others = await prisma.taskAssignee.findMany({
    where: { user: { primaryRole: { notIn: ["Developer", ...ROLES] } } },
    select: { user: { select: { primaryRole: true } } },
  });
  if (others.length) {
    const byRole = new Map<string, number>();
    for (const o of others) {
      byRole.set(o.user.primaryRole, (byRole.get(o.user.primaryRole) ?? 0) + 1);
    }
    console.log(
      `\nLeft alone — other non-Developer assignees: ` +
        Array.from(byRole, ([role, n]) => `${role} ×${n}`).join(", ") +
        `\n(Re-run with --roles=... to include a role.)`,
    );
  }

  if (!APPLY) {
    console.log(
      `\nDry run — nothing changed. Re-run with --apply to remove ${rows.length} assignment(s).`,
    );
    return;
  }
  if (rows.length === 0) return;

  // One audit entry per task, listing who was on it before and after.
  const byTask = new Map<number, typeof rows>();
  for (const r of rows) {
    byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), r]);
  }
  const audits = actorId
    ? Array.from(byTask.values()).map((group) => {
        const removed = new Set(group.map((g) => g.userId));
        const before = group[0].task.assignees.map((a) => a.user.name);
        const after = group[0].task.assignees
          .filter((a) => !removed.has(a.userId))
          .map((a) => a.user.name);
        return prisma.auditEntry.create({
          data: {
            actorId,
            action: "task.reassign",
            scope: group[0].task.project.name,
            taskTitle: group[0].task.title,
            before: before.join(", ") || "—",
            after: after.join(", ") || "—",
          },
        });
      })
    : [];

  // Delete exactly the rows listed above — by key, not by re-running the
  // role filter — so what was shown is what goes.
  const result = await prisma.$transaction([
    prisma.taskAssignee.deleteMany({
      where: { OR: rows.map((r) => ({ taskId: r.taskId, userId: r.userId })) },
    }),
    ...audits,
  ]);
  const deleted = (result[0] as { count: number }).count;

  console.log(
    `\nRemoved ${deleted} assignment(s) across ${byTask.size} task(s).` +
      (actorId ? ` Wrote ${audits.length} audit entr${audits.length === 1 ? "y" : "ies"}.` : ""),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
