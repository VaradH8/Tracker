import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { notFound } from "@/lib/api-v1/http";
import { USER_SELECT, serializeUser } from "@/lib/api-v1/serialize";

export const GET = v1<{ id: string }>(async (_req, { params, user }) => {
  const u = await prisma.user.findUnique({ where: { id: params.id }, select: USER_SELECT });
  // Other service accounts are not visible; your own is (same as /auth/me).
  if (!u || (u.isServiceAccount && u.id !== user.id)) throw notFound("User");
  return NextResponse.json(serializeUser(u));
});
export const DELETE = forbidDelete;
