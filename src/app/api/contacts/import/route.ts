import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";
import { importContactsCsv } from "@/lib/import-contacts";

export async function POST(req: Request) {
  return withSession(async (session) => {
    const parsed = z
      .object({
        csv: z.string().min(1).max(400_000),
        dryRun: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен CSV");
    const result = await importContactsCsv({
      workspaceId: session.workspaceId,
      actor: session.name,
      text: parsed.data.csv,
      dryRun: parsed.data.dryRun !== false,
    });
    return NextResponse.json(result);
  });
}
