import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}

// Keep a GET as a fallback so plain <a href="/api/auth/signout"> still works
// — old code paths used it.
export async function GET() {
  await signOut();
  return NextResponse.redirect(new URL("/login", "http://localhost"));
}
