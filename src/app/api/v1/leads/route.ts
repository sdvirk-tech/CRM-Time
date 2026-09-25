import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { requireApiKeyWorkspace } from "@/lib/api-key";
import { listLeadsV1 } from "@/lib/v1-read";

export async function GET(req: Request) {
  const auth = await requireApiKeyWorkspace(req);
  if (!auth) return jsonError("Нужен Authorization: Bearer <ключ API>", 401);
  const items = await listLeadsV1(auth.workspaceId);
  return NextResponse.json({ items, count: items.length });
}
