import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const user = String(body.user ?? body.email ?? "");
  const password = String(body.password ?? "");
  // Client IP for the rate limiter — see lib/client-ip.ts for why it is
  // the right-most X-Forwarded-For entry. Null in dev without a proxy.
  const ip = clientIp(req);
  const result = await signIn(user, password, ip);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  // Send the real role (HR stays HR); the client maps it to access.
  return NextResponse.json({
    user: { ...result.user, role: result.user.primaryRole ?? result.user.role },
  });
}
