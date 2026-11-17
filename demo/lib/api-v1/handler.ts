/**
 * Wrapper every /api/v1 route goes through: auth, rate limit, request log,
 * Idempotency-Key replay and the shared error shape.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { authenticateBearer, type ApiUser } from "./auth";
import { ApiError, apiError } from "./http";

export type ApiCtx<P> = {
  user: ApiUser;
  tokenId: number;
  url: URL;
  params: P;
};

type Handler<P> = (req: Request, ctx: ApiCtx<P>) => Promise<Response>;

/** Requests per minute per token (C-9 asks for at least 60). */
const RATE_PER_MIN = Number(process.env.API_V1_RATE_PER_MIN) || 120;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export function v1<P = Record<string, unknown>>(
  fn: Handler<P>,
  opts: { idempotent?: boolean } = {},
) {
  return async (
    req: Request,
    context: { params: Promise<P> },
  ): Promise<Response> => {
    const started = Date.now();
    const url = new URL(req.url);
    let userId: string | null = null;
    let tokenId: number | null = null;
    let res: Response;
    try {
      const auth = await authenticateBearer(req.headers.get("authorization"));
      if ("code" in auth) {
        res = apiError(401, auth.code, auth.message);
      } else {
        userId = auth.user.id;
        tokenId = auth.tokenId;
        const rl = rateLimit(`api-v1:${auth.tokenId}`, RATE_PER_MIN, 60_000);
        if (!rl.ok) {
          res = apiError(429, "rate_limited", "Too many requests", null, {
            "Retry-After": String(rl.retryInSec),
          });
        } else {
          const params = ((await context?.params) ?? {}) as P;
          const ctx: ApiCtx<P> = { user: auth.user, tokenId: auth.tokenId, url, params };
          const key = req.headers.get("idempotency-key");
          res =
            opts.idempotent && req.method === "POST" && key
              ? await withIdempotency(req, ctx, key, fn)
              : await fn(req, ctx);
        }
      }
    } catch (err) {
      res = toErrorResponse(err);
    }
    res.headers.set("Cache-Control", "no-store");
    logRequest(userId, tokenId, req.method, url.pathname, res.status, Date.now() - started);
    return res;
  };
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return apiError(err.status, err.code, err.message, err.field);
  }
  const code = (err as { code?: string })?.code;
  if (code === "P2025") return apiError(404, "not_found", "Not found");
  console.error("[api/v1] unhandled error", err);
  return apiError(500, "internal", "Internal error");
}

async function withIdempotency<P>(
  req: Request,
  ctx: ApiCtx<P>,
  key: string,
  fn: Handler<P>,
): Promise<Response> {
  if (key.length > 200) {
    throw new ApiError(400, "invalid", "Idempotency-Key is too long", "Idempotency-Key");
  }
  const path = ctx.url.pathname;
  const since = new Date(Date.now() - IDEMPOTENCY_TTL_MS);
  const prior = await prisma.apiIdempotency.findUnique({
    where: { userId_key: { userId: ctx.user.id, key } },
  });
  if (prior && prior.createdAt >= since) {
    if (prior.method !== req.method || prior.path !== path) {
      throw new ApiError(
        422,
        "idempotency_key_reused",
        "This Idempotency-Key was already used for a different request",
        "Idempotency-Key",
      );
    }
    return new NextResponse(prior.response, {
      status: prior.status,
      headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true" },
    });
  }
  const res = await fn(req, ctx);
  // Only successful results are replayed; a failed request may be retried.
  if (res.status < 400) {
    const body = await res.clone().text();
    await prisma.apiIdempotency
      .upsert({
        where: { userId_key: { userId: ctx.user.id, key } },
        create: { userId: ctx.user.id, key, method: req.method, path, status: res.status, response: body },
        update: { method: req.method, path, status: res.status, response: body, createdAt: new Date() },
      })
      .catch((e) => console.error("[api/v1] idempotency store failed", e));
    // Expired keys are a cache, not a record: prune them as we go.
    prisma.apiIdempotency.deleteMany({ where: { createdAt: { lt: since } } }).catch(() => null);
  }
  return res;
}

function logRequest(
  userId: string | null,
  tokenId: number | null,
  method: string,
  path: string,
  status: number,
  durationMs: number,
) {
  prisma.apiRequestLog
    .create({ data: { userId, tokenId, method, path, status, durationMs } })
    .catch(() => null);
}

/** S-2: the service account may never delete anything. */
export const forbidDelete = v1(async () => {
  throw new ApiError(403, "forbidden", "Deletes are not permitted for API accounts");
});
