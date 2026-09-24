import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { handleTelegramUpdate } from "@/lib/telegram-ingest";
import { channelToken, telegramSend } from "@/lib/telegram";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "telegram") return jsonError("Канал не найден", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);

  const update = (await req.json().catch(() => null)) as Parameters<typeof handleTelegramUpdate>[1] | null;
  if (!update) return NextResponse.json({ ok: true });
  const result = await handleTelegramUpdate(channel, update);
  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  if ("skipped" in result && result.skipped) return NextResponse.json({ ok: true });
  if ("duplicate" in result && result.duplicate) return NextResponse.json({ ok: true, duplicate: true });
  if ("start" in result && result.start && result.greeting) {
    const token = await channelToken(channel.id);
    const chatId = update.message?.chat?.id;
    if (token && chatId) {
      try {
        await telegramSend(token, String(chatId), result.greeting);
      } catch {
        /* черновик/приветствие уже во входящих */
      }
    }
  }
  return NextResponse.json(result);
}
