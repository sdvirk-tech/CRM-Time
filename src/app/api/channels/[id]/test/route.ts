import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { telegramGetMe, telegramSetWebhook } from "@/lib/telegram";
import { ingestInbound } from "@/lib/pipeline";
import { publicUrl } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const channel = await prisma.channel.findFirst({
      where: { id, workspaceId: session.workspaceId },
    });
    if (!channel) return jsonError("Канал не найден", 404);
    const body = (await req.json().catch(() => ({}))) as { kind?: string };

    if (channel.type === "telegram") {
      if (!channel.secretsEnc) return jsonError("Сначала сохраните токен");
      const token = decryptSecret(channel.secretsEnc);
      let me: { username?: string } | null = null;
      try {
        me = (await telegramGetMe(token)) ?? null;
      } catch (e) {
        return jsonError(e instanceof Error ? e.message : "Telegram getMe не ок");
      }
      let hook = { ok: false, description: "", url: `${publicUrl()}/api/ingest/telegram/${channel.publicKey}` };
      try {
        hook = await telegramSetWebhook(token, hook.url);
      } catch (e) {
        hook = { ...hook, description: e instanceof Error ? e.message : "Telegram недоступен" };
      }
      return NextResponse.json({
        ok: true,
        username: me?.username ?? null,
        webhook: hook,
        publicUrl: publicUrl(),
      });
    }

    if (channel.type === "web_form") {
      const result = await ingestInbound({
        workspaceId: session.workspaceId,
        channelId: channel.id,
        source: "web_form",
        externalId: `test:${session.userId}`,
        name: "Тестовая заявка",
        phone: "79990000000",
        body: "Имя: Тестовая заявка\nТелефон: 79990000000\nКомментарий: проверка цепочки",
        fields: {},
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (channel.type === "email") {
      const result = await ingestInbound({
        workspaceId: session.workspaceId,
        channelId: channel.id,
        source: "email",
        externalId: `test-${session.userId}@example.com`,
        username: `test-${session.userId}@example.com`,
        name: "Тест почты",
        body: "Тема: проверка\nОт: test@example.com\nПроверка почтового канала",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    return jsonError(body.kind ? "Неизвестный тест" : "Нет теста для канала");
  });
}
