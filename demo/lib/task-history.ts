import { prisma } from "@/lib/db";

/**
 * Per-task change history (TaskHistory). /api/v1 has always written it; the
 * UI routes now write it too, so every status change has a record of who
 * made it, when, and from what to what, whichever way it was made.
 *
 * Field names match /api/v1 (status, due_date, start_date, priority, title,
 * estimate_hours, important, description) and values are JSON-encoded, so
 * the task drawer and GET /api/v1/tasks/{id}/history read the same rows.
 */
export type HistoryChange = { field: string; old: unknown; new: unknown };

const enc = (v: unknown) => JSON.stringify(v ?? null);

/** Writes one row per change that actually changed something. */
export async function recordTaskHistory(
  taskId: number,
  changedById: string | null,
  changes: HistoryChange[],
): Promise<number> {
  const real = changes.filter((c) => enc(c.old) !== enc(c.new));
  if (real.length === 0) return 0;
  await prisma.taskHistory.createMany({
    data: real.map((c) => ({
      taskId,
      field: c.field,
      oldValue: enc(c.old),
      newValue: enc(c.new),
      changedById,
    })),
  });
  return real.length;
}

export function decodeHistoryValue(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** A Date column as the history stores it: YYYY-MM-DD, or null. */
export const ymd = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;
