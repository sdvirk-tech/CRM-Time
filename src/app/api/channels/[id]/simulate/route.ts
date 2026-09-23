import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { ingestInbound } from "@/lib/pipeline";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const channel = await prisma.channel.findFirst({
      where: { id, workspaceId: session.workspaceId },
    });
    if (!channel || channel.type !== "telegram") return jsonError("Нужен канал Telegram", 404);
    const parsed = z
      .object({
        chatId: z.string().min(1),
        text: z.string().min(1),
        username: z.string().optional(),
        name: z.string().optional(),
        eventKey: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужны chatId и text");
    const result = await ingestInbound({
      workspaceId: session.workspaceId,
      channelId: channel.id,
      source: "telegram",
      externalId: parsed.data.chatId,
      username: parsed.data.username,
      name: parsed.data.name,
      body: parsed.data.text,
      eventKey: parsed.data.eventKey,
    });
    return NextResponse.json({ ok: true, ...result });
  });
}
