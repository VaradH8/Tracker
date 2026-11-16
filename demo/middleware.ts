import { NextResponse, type NextRequest } from "next/server";
import { crossOriginRefusal } from "@/lib/csrf";

/** Refuses cross-origin writes to /api/* — see lib/csrf.ts. */
export function middleware(req: NextRequest) {
  const refusal = crossOriginRefusal(req);
  if (refusal) {
    return NextResponse.json(
      { error: "Forbidden: request did not come from this site." },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
