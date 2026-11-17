import { NextResponse } from "next/server";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { STATUSES } from "@/lib/api-v1/serialize";

/** Task status values, in workflow order. */
export const GET = v1(async () => NextResponse.json([...STATUSES]));
export const DELETE = forbidDelete;
