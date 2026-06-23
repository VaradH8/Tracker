import { NextResponse } from "next/server";
import { getDomainUser, countDomainUsers } from "@/lib/domain-auth";

export async function GET() {
  const user = await getDomainUser();
  const needsBootstrap = (await countDomainUsers()) === 0;
  return NextResponse.json({ user, needsBootstrap });
}