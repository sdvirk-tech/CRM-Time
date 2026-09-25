import { NextResponse } from "next/server";
import { z } from "zod";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { importWorkspaceJson } from "@/lib/workspace-import";

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({
        payload: z.unknown(),
        dryRun: z.boolean().optional(),
        mode: z.enum(["merge", "replace"]).optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const result = await importWorkspaceJson({
      workspaceId: session.workspaceId,
      actor: session.name,
      payload: parsed.data.payload,
      dryRun: parsed.data.dryRun === true,
      mode: parsed.data.mode,
    });
    if (result.errors.length && result.contacts.created === 0 && result.contacts.updated === 0 && !result.settings) {
      return jsonError(result.errors[0]?.detail || "Ошибка импорта", 400, { result });
    }
    return NextResponse.json(result);
  });
}
