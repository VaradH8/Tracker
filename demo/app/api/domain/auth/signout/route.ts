import { NextResponse } from "next/server";
import { domainSignOut } from "@/lib/domain-auth";

export async function POST() {
  await domainSignOut();
  return NextResponse.json({ ok: true });
}