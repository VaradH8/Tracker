import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { passwordIssue } from "@/lib/auth";

/** POST { token, password } — consumes a reset token and rewrites the
 *  user's passwordHash. Single-use: marks `usedAt` on the token and
 *  also invalidates every existing session on the account so a logged-
 *  in attacker doesn't survive the reset. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const tokenId = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!tokenId) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }
  const issue = passwordIssue(password);
  if (issue) {
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  const token = await prisma.passwordResetToken.findUnique({
    where: { id: tokenId },
  });
  if (!token || token.usedAt || token.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This link has expired or already been used. Ask for a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    }),
    // Kill every existing session on this account — the user (or
    // attacker) has to log in fresh with the new password.
    prisma.session.deleteMany({ where: { userId: token.userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
