import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { mergeContacts } from "@/lib/contacts";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const parsed = z.object({ otherId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен otherId");
    try {
      const contact = await mergeContacts({
        workspaceId: session.workspaceId,
        keepId: id,
        dropId: parsed.data.otherId,
      });
      return NextResponse.json({ ok: true, contact });
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Не удалось склеить", 400);
    }
  });
}
