import { NextResponse } from "next/server";
import { requireDomainUser, changeDomainPassword } from "@/lib/domain-auth";

/** Any signed-in domain user can change their own password. */
export async function POST(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;

  const body = await req.json().catch(() => ({}));
  const r = await changeDomainPassword(
    userOrResp.id,
    String(body.currentPassword ?? ""),
    String(body.newPassword ?? ""),
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
