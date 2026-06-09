import { NextResponse } from "next/server";
import { changePassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? "");
  const nextPassword = String(body.nextPassword ?? "");
  const result = await changePassword(currentPassword, nextPassword);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
