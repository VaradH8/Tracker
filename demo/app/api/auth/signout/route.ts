import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}

/** GET fallback so plain <a href="/api/auth/signout"> still works. The
 *  redirect target uses the incoming request's origin instead of a
 *  hard-coded localhost, so it works the same in dev and behind Caddy. */
export async function GET(req: Request) {
  await signOut();
  return NextResponse.redirect(new URL("/login", req.url));
}
