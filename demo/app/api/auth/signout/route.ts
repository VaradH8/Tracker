import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

/** Sign-out is POST-only: it clears the session, which is a state change
 *  and must not be triggerable by a cross-site GET (a `sameSite=lax`
 *  cookie is still sent on top-level GET navigations, so an
 *  `<img src=".../api/auth/signout">` or a link could force-logout a
 *  victim). The app calls this with `fetch(..., { method: "POST" })`. */
export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}

/** GET does NOT sign the user out — it just bounces to /login. Kept so a
 *  stray link to this URL lands somewhere sensible instead of 405, but it
 *  performs no state change, closing the CSRF-logout vector. */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/login", req.url));
}
