import { NextResponse } from "next/server";
import { domainSignIn } from "@/lib/domain-auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const r = await domainSignIn(
    String(body.email ?? ""),
    String(body.password ?? ""),
    ip,
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401 });
  return NextResponse.json({ user: r.user });
}