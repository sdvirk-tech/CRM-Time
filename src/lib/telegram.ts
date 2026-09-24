import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";

export async function telegramGetMe(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = (await res.json()) as { ok?: boolean; description?: string; result?: { username?: string } };
  if (!data.ok) throw new Error(data.description || "Telegram getMe не ок");
  return data.result;
}

export async function telegramSend(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (!data.ok) throw new Error(data.description || "Не удалось отправить в Telegram");
}

export async function telegramSetWebhook(token: string, url: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  return { ok: Boolean(data.ok), description: data.description || (data.ok ? "Webhook установлен" : "setWebhook не ок"), url };
}

export async function channelToken(channelId: string): Promise<string | null> {
  const ch = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!ch?.secretsEnc) return null;
  return decryptSecret(ch.secretsEnc);
}
