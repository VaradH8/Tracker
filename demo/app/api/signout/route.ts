import { NextResponse } from "next/server";

/**
 * Hard sign-out: clears every auth-shaped cookie sent by the browser plus
 * the known NextAuth v4 + v5 cookie names. JWT sessions are stateless, so
 * deleting the cookie IS the sign-out.
 *
 * Both GET and POST are supported so a plain <a href="/api/signout"> works
 * without JavaScript.
 */

const KNOWN_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  // NextAuth v4 legacy
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
];

function looksAuthRelated(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("auth") ||
    n.includes("session") ||
    n.includes("csrf") ||
    n.includes("callback")
  );
}

function build(req: Request): NextResponse {
  const url = new URL("/login", req.url);
  const res = NextResponse.redirect(url, 303);

  // 1) Clear every cookie the browser actually sent us that looks auth-shaped.
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sentNames = cookieHeader
    .split(";")
    .map((c) => c.trim().split("=")[0])
    .filter(Boolean);
  for (const name of sentNames) {
    if (looksAuthRelated(name)) {
      res.cookies.set(name, "", { maxAge: 0, path: "/", sameSite: "lax" });
    }
  }

  // 2) Belt-and-suspenders: also clear every known name even if the request
  //    didn't show one (cookie scope mismatch, prerender, etc.).
  for (const name of KNOWN_NAMES) {
    res.cookies.set(name, "", { maxAge: 0, path: "/", sameSite: "lax" });
  }

  // Prevent any layer (Vercel CDN, browser bfcache) from serving a cached
  // signed-in response after this point.
  res.headers.set(
    "Cache-Control",
    "no-store, no-cache, max-age=0, must-revalidate",
  );

  return res;
}

export async function GET(req: Request) {
  return build(req);
}

export async function POST(req: Request) {
  return build(req);
}
