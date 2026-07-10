import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, canManageUsers, writeAudit } from "@/lib/server-access";

/**
 * Full-database backup as JSON — an off-host safety net you can download
 * and later re-import. Admin only.
 *
 * Tables are listed in FK-dependency order so an import can insert them
 * top-to-bottom without violating foreign keys. Sessions / reset tokens
 * are intentionally excluded (transient auth state).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Delegate = any;

type TableSpec = {
  key: string;
  delegate: Delegate;
  dateFields: string[];
};

const TABLES: TableSpec[] = [
  { key: "user", delegate: prisma.user, dateFields: ["joined", "lastLoginAt", "createdAt", "updatedAt"] },
  { key: "client", delegate: prisma.client, dateFields: ["since", "createdAt", "updatedAt"] },
  { key: "appSettings", delegate: prisma.appSettings, dateFields: ["updatedAt"] },
  { key: "project", delegate: prisma.project, dateFields: ["startDate", "targetDate", "createdAt", "updatedAt"] },
  { key: "projectMember", delegate: prisma.projectMember, dateFields: ["createdAt"] },
  { key: "task", delegate: prisma.task, dateFields: ["startDate", "targetDate", "approvedAt", "createdAt", "updatedAt"] },
  { key: "taskAssignee", delegate: prisma.taskAssignee, dateFields: ["createdAt"] },
  { key: "taskDependency", delegate: prisma.taskDependency, dateFields: ["createdAt"] },
  { key: "taskAttachment", delegate: prisma.taskAttachment, dateFields: ["createdAt"] },
  { key: "remark", delegate: prisma.remark, dateFields: ["createdAt"] },
  { key: "timeEntry", delegate: prisma.timeEntry, dateFields: ["date", "startedAt", "endedAt", "createdAt"] },
  { key: "auditEntry", delegate: prisma.auditEntry, dateFields: ["createdAt"] },
  { key: "notification", delegate: prisma.notification, dateFields: ["createdAt"] },
  { key: "emailLog", delegate: prisma.emailLog, dateFields: ["createdAt"] },
  { key: "leave", delegate: prisma.leave, dateFields: ["start", "end", "createdAt"] },
  { key: "pipelineDeal", delegate: prisma.pipelineDeal, dateFields: ["expectedStart", "createdAt", "updatedAt"] },
  { key: "domainUser", delegate: prisma.domainUser, dateFields: ["createdAt", "updatedAt"] },
  { key: "domainProject", delegate: prisma.domainProject, dateFields: ["createdAt", "updatedAt"] },
  { key: "domainTask", delegate: prisma.domainTask, dateFields: ["startDate", "targetDate", "createdAt", "updatedAt"] },
  { key: "domainWorkLog", delegate: prisma.domainWorkLog, dateFields: ["date", "createdAt"] },
];

export async function GET() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    tables[t.key] = await t.delegate.findMany();
  }
  return NextResponse.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  });
}

/** Restore from a previously-exported backup. Best run against an empty
 *  database (after a fresh deploy). Existing rows with the same primary
 *  key are skipped, so it won't clobber live data — it tops up what's
 *  missing. */
export async function POST(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const actor = userOrResp;
  if (!canManageUsers(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const incoming: Record<string, unknown[]> | undefined =
    body?.tables && typeof body.tables === "object" ? body.tables : undefined;
  if (!incoming) {
    return NextResponse.json(
      { error: "Not a valid backup file (missing `tables`)." },
      { status: 400 },
    );
  }

  const summary: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = Array.isArray(incoming[t.key]) ? incoming[t.key] : [];
    if (rows.length === 0) {
      summary[t.key] = 0;
      continue;
    }
    // Revive ISO date strings into Date objects for the date columns.
    const data = (rows as Record<string, unknown>[]).map((row) => {
      const out: Record<string, unknown> = { ...row };
      for (const f of t.dateFields) {
        if (typeof out[f] === "string") out[f] = new Date(out[f] as string);
      }
      return out;
    });
    const res = await t.delegate.createMany({ data, skipDuplicates: true });
    summary[t.key] = res.count ?? 0;
  }

  // Realign the autoincrement sequences. createMany inserts rows with
  // their original integer ids but never advances the underlying
  // sequence, so without this the very next task/project/client/etc.
  // insert would try id=1 and collide (P2002) until the sequence
  // organically caught up — i.e. the app would reject writes right after
  // a "successful" restore. setval each Int-PK table to its current MAX.
  await resetSequences();

  await writeAudit(actor.id, "backup.import", {
    after: `Restored ${Object.values(summary).reduce((a, b) => a + b, 0)} rows`,
  });
  return NextResponse.json({ ok: true, restored: summary });
}

/** Tables whose primary key is a Postgres `serial`/autoincrement `Int`.
 *  String-cuid PKs (User, Session, PasswordResetToken, DomainUser,
 *  DomainSession) mint their own ids and need no sequence fix-up. */
const INT_PK_TABLES = [
  "Client",
  "Project",
  "Task",
  "TaskAttachment",
  "TimeEntry",
  "Remark",
  "AuditEntry",
  "Notification",
  "EmailLog",
  "Leave",
  "PipelineDeal",
  "DomainProject",
  "DomainTask",
  "DomainWorkLog",
] as const;

async function resetSequences() {
  for (const table of INT_PK_TABLES) {
    // pg_get_serial_sequence resolves the sequence backing "id". The third
    // setval arg (is_called) is false for an empty table so the first
    // insert still gets id 1, and true otherwise so the next insert gets
    // MAX+1.
    await prisma.$executeRawUnsafe(
      `SELECT setval(
         pg_get_serial_sequence('"${table}"', 'id'),
         COALESCE((SELECT MAX("id") FROM "${table}"), 1),
         (SELECT MAX("id") IS NOT NULL FROM "${table}")
       )`,
    );
  }
}