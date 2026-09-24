import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { publicUrl } from "@/lib/env";
import { telegramSetWebhook } from "@/lib/telegram";
import { enableTelegramPoll, httpsWebhookAvailable } from "@/lib/telegram-poll";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const channel = await prisma.channel.findFirst({
      where: { id, workspaceId: session.workspaceId, type: "telegram" },
    });
    if (!channel) return jsonError("Telegram-канал не найден", 404);
    if (!channel.secretsEnc) return jsonError("Сначала сохраните токен");
    const token = decryptSecret(channel.secretsEnc);
    const url = `${publicUrl()}/api/ingest/telegram/${channel.publicKey}`;
    if (!httpsWebhookAvailable()) {
      const poll = await enableTelegramPoll(channel.id, true);
      return NextResponse.json({
        ok: false,
        url,
        publicUrl: publicUrl(),
        pollMode: poll.pollMode,
        description: "Нет HTTPS PUBLIC_URL — бот принимает входящие опросом getUpdates",
      });
    }
    try {
      const result = await telegramSetWebhook(token, url);
      return NextResponse.json({
        ok: result.ok,
        url: result.url,
        publicUrl: publicUrl(),
        description: result.description,
      });
    } catch (e) {
      const poll = await enableTelegramPoll(channel.id, true);
      return NextResponse.json({
        ok: false,
        url,
        publicUrl: publicUrl(),
        pollMode: poll.pollMode,
        description: e instanceof Error ? e.message : "Telegram недоступен — включён опрос",
      });
    }
  });
}
