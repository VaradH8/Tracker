/**
 * Shared HTTP conventions for /api/v1 (the PM Inventive integration).
 * See docs/tracker-api-prd.md in pm-inventive, section 5.1.
 *
 *   - one error shape: { error: { code, message, field } }      (C-7)
 *   - list responses: { items, total, page, page_size }         (C-4)
 *   - dates YYYY-MM-DD, timestamps ISO-8601 UTC                 (C-6)
 */
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field: string | null = null,
  ) {
    super(message);
  }
}

export function apiError(
  status: number,
  code: string,
  message: string,
  field: string | null = null,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, field } },
    { status, headers },
  );
}

export const notFound = (what: string) =>
  new ApiError(404, "not_found", `${what} not found`);

export const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

export function pageParams(url: URL): { page: number; pageSize: number; skip: number } {
  const page = intParam(url, "page") ?? 1;
  const pageSize = intParam(url, "page_size") ?? DEFAULT_PAGE_SIZE;
  if (page < 1) throw new ApiError(400, "invalid", "page must be >= 1", "page");
  if (pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ApiError(400, "invalid", `page_size must be 1-${MAX_PAGE_SIZE}`, "page_size");
  }
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function paginated<T>(
  items: T[],
  total: number,
  p: { page: number; pageSize: number },
) {
  return NextResponse.json({ items, total, page: p.page, page_size: p.pageSize });
}

export function intParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ApiError(400, "invalid", `${name} must be an integer`, name);
  }
  return n;
}

export function boolParam(url: URL, name: string): boolean | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new ApiError(400, "invalid", `${name} must be true or false`, name);
}

export function dateParam(url: URL, name: string): Date | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  const d = parseDate(raw);
  if (!d) throw new ApiError(400, "invalid", `${name} must be YYYY-MM-DD`, name);
  return d;
}

export function timestampParam(url: URL, name: string): Date | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, "invalid", `${name} must be an ISO-8601 timestamp`, name);
  }
  return d;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-22" -> midnight UTC of that day (how the tracker stores dates). */
export function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return d;
}

export function fmtDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function fmtTs(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** Parse a JSON body that must be an object. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_json", "Request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

export function routeId(raw: string, what = "id"): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ApiError(400, "invalid", `${what} must be a positive integer`, what);
  }
  return n;
}
