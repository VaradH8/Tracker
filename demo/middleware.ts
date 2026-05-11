import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/", "/login", "/api/auth"];

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
}

function landingFor(role: string | undefined): string {
  switch (role) {
    case "Admin":
      return "/dashboard";
    case "BusinessDeveloper":
      return "/projects";
    case "Developer":
      return "/my-tasks";
    case "Coordinator":
    default:
      return "/my-day";
  }
}

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isAuthed = !!req.auth;

  if (!isAuthed && !isPublic(path)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isAuthed && path === "/login") {
    const role = (req.auth?.user as { role?: string } | undefined)?.role;
    return NextResponse.redirect(new URL(landingFor(role), req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
