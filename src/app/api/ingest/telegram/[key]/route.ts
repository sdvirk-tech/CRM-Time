import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { ingestInbound } from "@/lib/pipeline";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "telegram") return jsonError("Канал не найден", 404);

  const update = (await req.json().catch(() => null)) as {
    message?: {
      chat?: { id?: number };
      from?: { id?: number; username?: string; first_name?: string; last_name?: string };
      text?: string;
    };
  } | null;
  const msg = update?.message;
  if (!msg?.chat?.id || !msg.text) return NextResponse.json({ ok: true });

  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ");
  await ingestInbound({
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    source: "telegram",
    externalId: String(msg.chat.id),
    username: msg.from?.username,
    name: name || msg.from?.username,
    body: msg.text,
  });
  return NextResponse.json({ ok: true });
}
