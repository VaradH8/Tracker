import { NextResponse } from "next/server";
import { forbidDelete, v1 } from "@/lib/api-v1/handler";
import { jsonBody, routeId } from "@/lib/api-v1/http";
import { serializeTask } from "@/lib/api-v1/serialize";
import { loadTask, readAttribution, updateTask } from "@/lib/api-v1/tasks";

export const GET = v1<{ id: string }>(async (_req, { params }) => {
  return NextResponse.json(serializeTask(await loadTask(routeId(params.id))));
});

/** Partial update: only the fields sent change (C-5). */
export const PATCH = v1<{ id: string }>(async (req, { params, user, url }) => {
  const id = routeId(params.id);
  const body = await jsonBody(req);
  const attr = await readAttribution(body);
  return NextResponse.json(await updateTask(id, body, user, attr, url.origin));
});

export const DELETE = forbidDelete;
