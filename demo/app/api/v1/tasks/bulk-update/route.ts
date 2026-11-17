import { NextResponse } from "next/server";
import { forbidDelete, toErrorResponse, v1 } from "@/lib/api-v1/handler";
import { ApiError, jsonBody } from "@/lib/api-v1/http";
import { readAttribution, updateTask } from "@/lib/api-v1/tasks";

const MAX_UPDATES = 200;

/**
 * Update many tasks in one call. Each row stands alone — one bad row does
 * not fail the batch — and each row may carry its own source_note /
 * on_behalf_of_user_id, falling back to the batch-level ones.
 */
export const POST = v1(
  async (req, { user, url }) => {
    const body = await jsonBody(req);
    for (const k of Object.keys(body)) {
      if (!["updates", "source_note", "on_behalf_of_user_id"].includes(k)) {
        throw new ApiError(403, "forbidden_field", `Field '${k}' is not allowed here`, k);
      }
    }
    const updates = body.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new ApiError(422, "invalid", "updates must be a non-empty array", "updates");
    }
    if (updates.length > MAX_UPDATES) {
      throw new ApiError(422, "invalid", `At most ${MAX_UPDATES} updates per call`, "updates");
    }
    const batchAttr = await readAttribution(body);

    const results: { id: unknown; ok: boolean; error?: string; code?: string; field?: string | null }[] = [];
    for (const raw of updates) {
      const row = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : null;
      const id = row?.id;
      if (!row || !Number.isInteger(id) || (id as number) < 1) {
        results.push({ id: id ?? null, ok: false, code: "invalid", error: "Each update needs an integer id" });
        continue;
      }
      delete row.id;
      try {
        const attr = await readAttribution(row, batchAttr);
        await updateTask(id as number, row, user, attr, url.origin);
        results.push({ id, ok: true });
      } catch (err) {
        const res = toErrorResponse(err);
        const payload = (await res.json()) as { error: { code: string; message: string; field: string | null } };
        results.push({ id, ok: false, code: payload.error.code, error: payload.error.message, field: payload.error.field });
      }
    }
    return NextResponse.json({ results });
  },
  { idempotent: true },
);

export const DELETE = forbidDelete;
