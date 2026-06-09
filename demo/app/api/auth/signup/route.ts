import { NextResponse } from "next/server";
import { register } from "@/lib/auth";
import type { Role } from "@/lib/role";

const ROLES: Role[] = [
  "Admin",
  "Coordinator",
  "BusinessDeveloper",
  "Developer",
];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "");
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  const roleInput = String(body.role ?? "Developer") as Role;
  const role = ROLES.includes(roleInput) ? roleInput : "Developer";

  const result = await register({ name, email, role, password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ user: result.user });
}
