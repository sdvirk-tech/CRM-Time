import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";
import { publicUrl } from "./env";
import { telegramDeleteWebhook, telegramGetUpdates } from "./telegram";
import { asPollConfig, handleTelegramUpdate, mergeChannelConfig, type TelegramUpdate } from "./telegram-ingest";

export function httpsWebhookAvailable() {
  return publicUrl().startsWith("https://");
}

export async function pollTelegramChannel(channelId: string, injected?: TelegramUpdate[]) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel || channel.type !== "telegram") return { ok: false as const, error: "Не Telegram" };
  if (channel.enabled === false) return { ok: false as const, error: "Канал выключен" };
  const cfg = asPollConfig(channel.config);
  const processed: unknown[] = [];

  if (injected?.length) {
    let last = cfg.pollOffset ?? 0;
    for (const upd of injected) {
      const r = await handleTelegramUpdate(channel, upd);
      processed.push(r);
      if (upd.update_id != null) last = Math.max(last, upd.update_id + 1);
    }
    await mergeChannelConfig(channel.id, { pollMode: true, pollOffset: last });
    return { ok: true as const, processed: processed.length, offset: last, poll: true };
  }

  if (!channel.secretsEnc) return { ok: false as const, error: "Нет токена" };
  const token = decryptSecret(channel.secretsEnc);
  const updates = await telegramGetUpdates(token, cfg.pollOffset ?? 0);
  let last = cfg.pollOffset ?? 0;
  for (const upd of updates) {
    await handleTelegramUpdate(channel, upd as TelegramUpdate);
    if (upd.update_id != null) last = Math.max(last, upd.update_id + 1);
  }
  if (updates.length) await mergeChannelConfig(channel.id, { pollOffset: last });
  return { ok: true as const, processed: updates.length, offset: last, poll: true };
}

export async function pollTelegramChannels() {
  const channels = await prisma.channel.findMany({ where: { type: "telegram", enabled: true } });
  let processed = 0;
  for (const ch of channels) {
    const cfg = asPollConfig(ch.config);
    const should = cfg.pollMode === true || (!httpsWebhookAvailable() && Boolean(ch.secretsEnc));
    if (!should || !ch.secretsEnc) continue;
    try {
      const r = await pollTelegramChannel(ch.id);
      if (r.ok) processed += r.processed;
    } catch {
      /* токен/сеть — канал жив, тик не валит приложение */
    }
  }
  return { processed };
}

export async function enableTelegramPoll(channelId: string, on: boolean) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel?.secretsEnc) {
    await mergeChannelConfig(channelId, { pollMode: on });
    return { pollMode: on, webhook: null as string | null };
  }
  const token = decryptSecret(channel.secretsEnc);
  if (on) {
    try {
      await telegramDeleteWebhook(token);
    } catch {
      /* опрос всё равно */
    }
    await mergeChannelConfig(channelId, { pollMode: true });
    return { pollMode: true, webhook: "снят, опрос getUpdates" };
  }
  await mergeChannelConfig(channelId, { pollMode: false });
  return { pollMode: false, webhook: null as string | null };
}
