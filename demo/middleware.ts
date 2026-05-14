import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/", "/login", "/api/auth", "/api/signout"];

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
}

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isAuthed = !!req.auth;

  if (!isAuthed && !isPublic(path)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Deliberately do NOT redirect authed users away from /login.
  // The login page is also the role-switcher: an already-signed-in user
  // visits /login when they want to switch role. Auto-redirecting away
  // strands users with a stale session and no way to recover.

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
