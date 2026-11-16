import { NextResponse } from "next/server";
import { openapi } from "@/lib/api-v1/openapi";

/** The API contract. Public: it describes shapes, not data. */
export function GET() {
  return NextResponse.json(openapi);
}
