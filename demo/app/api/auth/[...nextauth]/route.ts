import { NextResponse } from "next/server";

/**
 * Legacy NextAuth catch-all. The app now uses POST /api/auth/signin,
 * /api/auth/signout, /api/auth/signup, /api/auth/change-password, and
 * GET /api/me — all backed by `lib/auth.ts` (cookie + DB session).
 * Anything still hitting this path gets a clean 410.
 */
export function GET() {
  return NextResponse.json(
    {
      error:
        "NextAuth endpoints are no longer in use. See /api/auth/signin, /signup, /signout, /change-password.",
    },
    { status: 410 },
  );
}

export const POST = GET;
