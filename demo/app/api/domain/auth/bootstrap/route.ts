import { NextResponse } from "next/server";
import { countDomainUsers, createDomainAccount } from "@/lib/domain-auth";

/** Create the very first domain admin. Only works while the domain has
 *  zero users — after that, accounts are added by an admin. */
export async function POST(req: Request) {
  if ((await countDomainUsers()) > 0) {
    return NextResponse.json(
      { error: "The domain already has users. Ask an admin to add you." },
      { status: 403 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "");
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  const r = await createDomainAccount(
    { name, email, password, role: "Admin" },
    { signInAfter: true },
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({
    user: { id: r.id, name: name.trim(), email: email.trim().toLowerCase(), role: "Admin" },
  });
}