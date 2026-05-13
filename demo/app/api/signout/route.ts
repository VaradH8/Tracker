import { NextResponse } from "next/server";

/**
 * Plain POST endpoint that clears every cookie name NextAuth might be
 * using and redirects to /login. Independent of NextAuth's client/server
 * signOut helpers, which have been flaky in v5 beta.
 *
 * Since JWT sessions are stateless, deleting the cookie IS the entire
 * sign-out operation.
 */
const COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  // Legacy NextAuth v4 names — clear too in case of an older cookie
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function clearAll(res: NextResponse) {
  for (const name of COOKIE_NAMES) {
    res.cookies.set(name, "", {
      maxAge: 0,
      path: "/",
      sameSite: "lax",
    });
  }
  return res;
}

export async function POST(req: Request) {
  const url = new URL("/login", req.url);
  return clearAll(NextResponse.redirect(url, 303));
}

export async function GET(req: Request) {
  const url = new URL("/login", req.url);
  return clearAll(NextResponse.redirect(url, 303));
}
