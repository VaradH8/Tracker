import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { ApiError } from "@/lib/api-v1/http";

/**
 * Anything under /api/v1 that isn't a real route. Paths that look like
 * evaluation data are answered 403 rather than 404 (S-1), so the
 * integration is told plainly that the area is off-limits.
 */
const EVALUATION = /\/(performance|reviews?|ratings?|appraisals?|kpis?|salar(y|ies)|evaluations?|pay)(\/|$)/i;

const unknown = v1(async (req) => {
  const path = new URL(req.url).pathname;
  if (EVALUATION.test(path)) {
    throw new ApiError(403, "forbidden", "Performance and evaluation data is not available to API accounts");
  }
  throw new ApiError(404, "not_found", "No such endpoint");
});

export const GET = unknown;
export const POST = unknown;
export const PUT = unknown;
export const PATCH = unknown;
export const DELETE = forbidDelete;
