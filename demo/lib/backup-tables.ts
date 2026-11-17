import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Which tables the JSON backup (/api/admin/backup) carries, in what order.
 * Read from the Prisma schema so the list can't fall behind it again.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Delegate = any;

export type TableSpec = {
  /** Model name, e.g. "DomainUser" — also the Postgres table name. */
  model: string;
  /** Backup JSON key: the client delegate name, e.g. "domainUser". */
  key: string;
  delegate: Delegate;
  dateFields: string[];
  /** Autoincrement Int primary key — its sequence needs realigning. */
  intPk: boolean;
};

/** Transient auth state: never backed up, never restored. */
// API tokens and idempotency replays are transient auth state too: a
// restored backup should never carry live bearer-token hashes.
export const SKIP = new Set([
  "Session",
  "DomainSession",
  "PasswordResetToken",
  "ApiToken",
  "ApiIdempotency",
]);

/** Models that hold a passwordHash column. */
export const CREDENTIAL_MODELS = new Set(["User", "DomainUser"]);

/** Every persistent model, parents before children. Read from the schema
 *  (Prisma.dmmf), so a new table is backed up the day it's added. */
export function backupTables(): TableSpec[] {
  const models = Prisma.dmmf.datamodel.models.filter((m) => !SKIP.has(m.name));
  const deps = new Map<string, string[]>();
  for (const m of models) {
    deps.set(
      m.name,
      m.fields
        .filter(
          (f) =>
            f.kind === "object" &&
            (f.relationFromFields?.length ?? 0) > 0 &&
            f.type !== m.name &&
            !SKIP.has(f.type),
        )
        .map((f) => f.type),
    );
  }
  // Kahn-style passes in schema order: a model goes once all its parents
  // have. A self-relation (User.reportingManager, Task.forkedFrom) is fine:
  // one createMany inserts its rows in one statement. Anything left over
  // by a cycle is appended in schema order rather than dropped.
  const order: string[] = [];
  const placed = new Set<string>();
  for (let progress = true; progress; ) {
    progress = false;
    for (const m of models) {
      if (placed.has(m.name)) continue;
      if ((deps.get(m.name) ?? []).every((d) => placed.has(d))) {
        order.push(m.name);
        placed.add(m.name);
        progress = true;
      }
    }
  }
  for (const m of models) if (!placed.has(m.name)) order.push(m.name);

  const byName = new Map(models.map((m) => [m.name, m]));
  return order.map((name) => {
    const m = byName.get(name)!;
    const key = name.charAt(0).toLowerCase() + name.slice(1);
    return {
      model: name,
      key,
      delegate: (prisma as unknown as Record<string, Delegate>)[key],
      dateFields: m.fields
        .filter((f) => f.kind === "scalar" && f.type === "DateTime")
        .map((f) => f.name),
      intPk: m.fields.some(
        (f) =>
          f.isId &&
          f.type === "Int" &&
          typeof f.default === "object" &&
          f.default !== null &&
          "name" in f.default &&
          f.default.name === "autoincrement",
      ),
    };
  });
}
