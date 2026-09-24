import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { asPollConfig } from "@/lib/telegram-ingest";
import { enableTelegramPoll, pollTelegramChannel } from "@/lib/telegram-poll";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const channel = await prisma.channel.findFirst({
      where: { id, workspaceId: session.workspaceId, type: "telegram" },
    });
    if (!channel) return jsonError("Telegram-канал не найден", 404);
    const cfg = asPollConfig(channel.config);
    return NextResponse.json({
      pollMode: Boolean(cfg.pollMode),
      pollOffset: cfg.pollOffset ?? 0,
    });
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const channel = await prisma.channel.findFirst({
      where: { id, workspaceId: session.workspaceId, type: "telegram" },
    });
    if (!channel) return jsonError("Telegram-канал не найден", 404);
    const parsed = z
      .object({
        pollMode: z.boolean().optional(),
        run: z.boolean().optional(),
        updates: z
          .array(
            z.object({
              update_id: z.number().optional(),
              message: z
                .object({
                  chat: z.object({ id: z.number().optional() }).optional(),
                  from: z
                    .object({
                      id: z.number().optional(),
                      username: z.string().optional(),
                      first_name: z.string().optional(),
                      last_name: z.string().optional(),
                    })
                    .optional(),
                  text: z.string().optional(),
                  caption: z.string().optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");

    if (parsed.data.pollMode !== undefined) {
      const en = await enableTelegramPoll(id, parsed.data.pollMode);
      return NextResponse.json({ ok: true, ...en });
    }
    if (parsed.data.updates?.length) {
      const r = await pollTelegramChannel(id, parsed.data.updates);
      return NextResponse.json(r);
    }
    if (parsed.data.run) {
      try {
        const r = await pollTelegramChannel(id);
        return NextResponse.json(r);
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : "Опрос не удался", 400);
      }
    }
    return jsonError("Нужен pollMode, run или updates");
  });
}
