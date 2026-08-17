import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getDomainUser,
  countDomainUsers,
  requireDomainUser,
  nameClash,
  setDomainEmail,
} from "@/lib/domain-auth";
import { SUPERVISOR_ROLES } from "@/lib/domain";

export async function GET() {
  const user = await getDomainUser();
  const needsBootstrap = (await countDomainUsers()) === 0;
  return NextResponse.json({ user, needsBootstrap });
}

/**
 * Change your own name and sign-in email.
 *
 * Limited to Admins, Leads and Team Leads. SMEs and Actionees keep their
 * own password (that is the self-service change-password route) but do not
 * edit their own name or email: those are how everyone else identifies
 * them on a picker, an approval and a delivery record, and someone
 * renaming themselves mid-project makes the trail harder to follow for
 * everyone but them. A supervisor can still change it for them.
 *
 * Your role and active flag are never editable here at all, by anyone —
 * see users/[id], which refuses them even for an Admin acting on
 * themselves.
 */
export async function PATCH(req: Request) {
  const userOrResp = await requireDomainUser();
  if (userOrResp instanceof NextResponse) return userOrResp;
  const user = userOrResp;

  if (!SUPERVISOR_ROLES.includes(user.role)) {
    return NextResponse.json(
      {
        error:
          "You can change your password from here. Ask an Admin, Lead or Team Lead to change your name or email.",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    }
    if (name !== user.name) {
      const clash = await nameClash(name, user.id);
      if (clash) {
        return NextResponse.json(
          {
            error: `${clash.name} already has an account (${clash.email}). Use a name that tells them apart.`,
          },
          { status: 400 },
        );
      }
      data.name = name;
    }
  }

  let emailChanged = false;
  if (typeof body.email === "string" && body.email.trim()) {
    const r = await setDomainEmail(user.id, body.email);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    emailChanged = true;
  }

  if (Object.keys(data).length === 0 && !emailChanged) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated =
    Object.keys(data).length === 0
      ? await prisma.domainUser.findUniqueOrThrow({ where: { id: user.id } })
      : await prisma.domainUser.update({ where: { id: user.id }, data });

  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
    },
  });
}
