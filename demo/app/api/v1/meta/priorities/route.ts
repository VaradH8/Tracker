import { NextResponse } from "next/server";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { PRIORITIES } from "@/lib/api-v1/serialize";

/** Task priority values, lowest to highest. */
export const GET = v1(async () => NextResponse.json([...PRIORITIES]));
export const DELETE = forbidDelete;
