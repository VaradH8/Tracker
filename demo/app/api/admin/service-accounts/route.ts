import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageUsers, requireUser, writeAudit } from "@/lib/server-access";
import { ensureServiceAccount, issueApiToken } from "@/lib/api-v1/auth";

/**
 * Service accounts for the /api/v1 integration (PM Inventive). Admin only.
 *
 *   GET  — every service account with its tokens (never the token values)
 *   POST — { name, email, tokenName? } creates the account if needed and
 *          issues a token. The raw token is in the response ONCE; store it
 *          in a password manager (S-7), it cannot be shown again.
 */
async function admin() {
  const userOrResp = await requireUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  if (!canManageUsers(userOrResp.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return userOrResp;
}

export async function GET() {
  const actor = await admin();
  if (actor instanceof NextResponse) return actor;
  const accounts = await prisma.user.findMany({
    where: { isServiceAccount: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
      apiTokens: {
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      },
    },
  });
  return NextResponse.json({ accounts });
}

export async function POST(req: Request) {
  const actor = await admin();
  if (actor instanceof NextResponse) return actor;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "PM Inventive";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required for the service account." }, { status: 400 });
  }
  const tokenName = typeof body.tokenName === "string" && body.tokenName.trim() ? body.tokenName.trim() : "default";

  let account;
  try {
    account = await ensureServiceAccount({ name, email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
  const token = await issueApiToken({ userId: account.id, name: tokenName, createdById: actor.id });
  await writeAudit(actor.id, "api_token.create", {
    scope: email,
    after: `${tokenName} (${token.prefix}…)${account.created ? " — new service account" : ""}`,
  });
  return NextResponse.json(
    { accountId: account.id, created: account.created, tokenId: token.id, token: token.token },
    { status: 201 },
  );
}
