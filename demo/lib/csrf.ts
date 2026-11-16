import type { NextRequest } from "next/server";

/**
 * CSRF guard for the API: a state-changing request must come from this
 * site's own pages.
 *
 * Session cookies are SameSite=Lax, which already keeps them off a POST
 * from a different *site*. It does not cover a different *origin* on the
 * same site: every *.inventivebizsol.co.in app counts as same-site, so a
 * script running on any of them could post here with the user's cookie.
 * Browsers put an Origin header on every cross-origin POST/PATCH/PUT/
 * DELETE (and on same-origin fetch POSTs), so comparing it to our own
 * host closes that gap.
 *
 * A request with no Origin at all is let through: browsers always send
 * one on the requests that matter here, and its absence means a non-browser
 * client (curl, a health probe, a maintenance script) — which carries no
 * victim's cookie to abuse.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestHost(req: NextRequest): string | null {
  // Behind Traefik both carry the public hostname; the forwarded one wins
  // when a proxy rewrites Host. Only the first entry counts if a chain of
  // proxies appended several.
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("host");
}

export function crossOriginRefusal(req: NextRequest): string | null {
  if (SAFE_METHODS.has(req.method)) return null;
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return "cross-site request";
  }
  const origin = req.headers.get("origin");
  if (!origin) return null;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return "unreadable Origin";
  }
  const host = requestHost(req);
  if (!host || originHost.toLowerCase() !== host.toLowerCase()) {
    return "Origin does not match this site";
  }
  return null;
}
