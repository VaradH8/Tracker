import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const user = String(body.user ?? body.email ?? "");
  const password = String(body.password ?? "");
  const result = await signIn(user, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({ user: result.user });
}
