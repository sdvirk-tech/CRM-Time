import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { ingestInbound } from "@/lib/pipeline";
import { channelToken, telegramSend } from "@/lib/telegram";
import { photoNoteFromUrl } from "@/lib/uploads";

type Ctx = { params: Promise<{ key: string }> };

type TgPhoto = { file_id: string; width?: number; height?: number };

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "telegram") return jsonError("Канал не найден", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);

  const update = (await req.json().catch(() => null)) as {
    update_id?: number;
    message?: {
      chat?: { id?: number };
      from?: { id?: number; username?: string; first_name?: string; last_name?: string };
      text?: string;
      caption?: string;
      photo?: TgPhoto[];
      document?: { file_id?: string; mime_type?: string; file_name?: string };
    };
  } | null;
  const msg = update?.message;
  if (!msg?.chat?.id) return NextResponse.json({ ok: true });

  const photos = msg.photo || [];
  const best = photos.length ? photos[photos.length - 1] : null;
  const photoNote = best?.file_id ? photoNoteFromUrl(`file_id:${best.file_id}`) : "";
  const docNote =
    msg.document?.mime_type?.startsWith("image/") && msg.document.file_id
      ? photoNoteFromUrl(`file_id:${msg.document.file_id}`)
      : "";
  const body = [msg.text || msg.caption || "", photoNote || docNote].filter(Boolean).join("\n");
  if (!body) return NextResponse.json({ ok: true });

  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ");
  const result = await ingestInbound({
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    source: "telegram",
    externalId: String(msg.chat.id),
    username: msg.from?.username,
    name: name || msg.from?.username,
    body,
    eventKey: update?.update_id != null ? String(update.update_id) : undefined,
  });
  if (result.duplicate) return NextResponse.json({ ok: true, duplicate: true });
  if (result.start && result.greeting) {
    const token = await channelToken(channel.id);
    if (token) {
      try {
        await telegramSend(token, String(msg.chat.id), result.greeting);
      } catch {
        /* черновик/приветствие уже во входящих */
      }
    }
  }
  return NextResponse.json({ ok: true, ...result });
}
