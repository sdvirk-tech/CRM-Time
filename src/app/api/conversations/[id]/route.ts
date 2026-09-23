import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { channelToken, telegramSend } from "@/lib/telegram";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: {
        contact: { include: { channels: true, leads: true, fieldValues: { include: { field: true } } } },
        channel: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conv) return jsonError("Диалог не найден", 404);
    await prisma.conversation.update({ where: { id }, data: { unread: false } });
    return NextResponse.json(conv);
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: { channel: true, contact: { include: { channels: true } } },
    });
    if (!conv) return jsonError("Диалог не найден", 404);
    const parsed = z
      .object({
        text: z.string().min(1),
        send: z.boolean().optional(),
        draftId: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен текст");

    let body = parsed.data.text;
    if (parsed.data.draftId) {
      const draft = await prisma.message.findFirst({
        where: { id: parsed.data.draftId, conversationId: id, direction: "draft" },
      });
      if (draft) body = parsed.data.text || draft.body;
    }

    if (parsed.data.send && conv.channel.type === "telegram") {
      const token = await channelToken(conv.channel.id);
      const ext = conv.contact.channels.find((c) => c.type === "telegram");
      if (!token || !ext) return jsonError("Нет токена или chat id Telegram");
      await telegramSend(token, ext.externalId, body);
      const msg = await prisma.message.create({
        data: {
          workspaceId: session.workspaceId,
          conversationId: id,
          direction: "outbound",
          body,
          sentAt: new Date(),
        },
      });
      return NextResponse.json({ message: msg, sent: true });
    }

    const msg = await prisma.message.create({
      data: {
        workspaceId: session.workspaceId,
        conversationId: id,
        direction: parsed.data.send ? "outbound" : "draft",
        body,
        sentAt: parsed.data.send ? new Date() : null,
      },
    });
    return NextResponse.json({ message: msg, sent: Boolean(parsed.data.send) });
  });
}
