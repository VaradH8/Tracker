import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser, canManageUsers, writeAudit } from "@/lib/server-access";
import { backupTables, CREDENTIAL_MODELS } from "@/lib/backup-tables";

/**
 * Full-database backup as JSON — an off-host safety net you can download
 * and later re-import. Admin only.
 *
 * The table list is read from the Prisma schema, not typed out by hand:
 * the hand-kept list had fallen 15 tables behind (performance reviews,
 * forecasts and most of Engineering), so a "full" backup silently left
 * them out. Tables come out in foreign-key order so an import can insert
 * them top-to-bottom. Sessions and reset tokens are excluded (transient
 * auth state).
 *
 * Password hashes are left out unless asked for (`?credentials=1`): one
 * download used to carry every account's hash. A backup without them
 * still restores every record; accounts restored from it get an unusable
 * password and sign in again through "Forgot password" or an admin reset.
 */

export async function GET(req: Request) {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const withCredentials =
    new URL(req.url).searchParams.get("credentials") === "1";

  const tables: Record<string, unknown[]> = {};
  for (const t of backupTables()) {
    const rows: Record<string, unknown>[] = await t.delegate.findMany();
    tables[t.key] =
      CREDENTIAL_MODELS.has(t.model) && !withCredentials
        ? rows.map(({ passwordHash: _omit, ...rest }) => rest)
        : rows;
  }
  await writeAudit(userOrResp.id, "backup.export", {
    after: withCredentials ? "with password hashes" : "without password hashes",
  });
  return NextResponse.json(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      credentials: withCredentials,
      tables,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
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

  // Accounts in a backup taken without credentials need SOME hash to
  // satisfy the NOT NULL column. A fresh bcrypt of 32 random bytes is one
  // nobody knows: the account exists but signs in only after a reset.
  const unusableHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  const tables = backupTables();
  const summary: Record<string, number> = {};
  for (const t of tables) {
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
      if (CREDENTIAL_MODELS.has(t.model) && typeof out.passwordHash !== "string") {
        out.passwordHash = unusableHash;
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
  await resetSequences(tables.filter((t) => t.intPk).map((t) => t.model));

  await writeAudit(actor.id, "backup.import", {
    after: `Restored ${Object.values(summary).reduce((a, b) => a + b, 0)} rows`,
  });
  return NextResponse.json({ ok: true, restored: summary });
}

/** `tables` are model names with an autoincrement Int primary key, taken
 *  from the schema (never from the request), so interpolating them into
 *  the SQL below is safe. */
async function resetSequences(tables: string[]) {
  for (const table of tables) {
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