import { prisma } from "./prisma";
import { ingestInbound } from "./pipeline";
import { photoNoteFromUrl } from "./uploads";

export type TgPhoto = { file_id: string; width?: number; height?: number };

export type TelegramUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number };
    from?: { id?: number; username?: string; first_name?: string; last_name?: string };
    text?: string;
    caption?: string;
    photo?: TgPhoto[];
    document?: { file_id?: string; mime_type?: string; file_name?: string };
  };
};

export async function handleTelegramUpdate(
  channel: { id: string; workspaceId: string; enabled: boolean | null },
  update: TelegramUpdate,
) {
  const msg = update?.message;
  if (!msg?.chat?.id) return { ok: true as const, skipped: true };
  if (channel.enabled === false) return { ok: false as const, error: "Канал выключен", status: 403 };

  const photos = msg.photo || [];
  const best = photos.length ? photos[photos.length - 1] : null;
  const photoNote = best?.file_id ? photoNoteFromUrl(`file_id:${best.file_id}`) : "";
  const docNote =
    msg.document?.mime_type?.startsWith("image/") && msg.document.file_id
      ? photoNoteFromUrl(`file_id:${msg.document.file_id}`)
      : "";
  const body = [msg.text || msg.caption || "", photoNote || docNote].filter(Boolean).join("\n");
  if (!body) return { ok: true as const, skipped: true };

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
  return { ok: true as const, ...result };
}

export type ChannelPollConfig = {
  allowedOrigins?: string[];
  pollMode?: boolean;
  pollOffset?: number;
};

export function asPollConfig(raw: unknown): ChannelPollConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as ChannelPollConfig;
}

export async function mergeChannelConfig(channelId: string, patch: ChannelPollConfig) {
  const ch = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
  const prev = asPollConfig(ch.config);
  const next = { ...prev, ...patch };
  await prisma.channel.update({ where: { id: channelId }, data: { config: next } });
  return next;
}
