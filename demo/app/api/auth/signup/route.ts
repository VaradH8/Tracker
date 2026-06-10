import { NextResponse } from "next/server";
import { register } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Open sign-up is intentionally limited to the **first** account on a
 * fresh deployment — that account is forced to Admin so somebody can
 * bootstrap the team. After that, /signup returns 403 and the Admin
 * must create users via /users (which uses /api/users behind the scenes).
 *
 * This stops anyone with the URL from self-promoting to Admin after the
 * tool is live. To open sign-up later (e.g. with an invite-token flow),
 * revisit this route.
 */
export async function POST(req: Request) {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return NextResponse.json(
      {
        error:
          "Sign-up is disabled. Ask your administrator to create your account.",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "");
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  // Bootstrap user is always Admin — ignore whatever role was sent.
  const result = await register({ name, email, role: "Admin", password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ user: result.user });
}

/**
 * GET — lightweight check for the /signup page so it can show the right
 * UI ("Bootstrap your team" vs "Sign-up is closed, ask Admin").
 */
export async function GET() {
  const userCount = await prisma.user.count();
  return NextResponse.json({ allowed: userCount === 0 });
}
