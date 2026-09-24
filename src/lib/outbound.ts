import { prisma } from "./prisma";
import { channelToken, telegramSend } from "./telegram";
import { parseEmailSecrets, sendSmtp } from "./email";

type Conv = {
  id: string;
  workspaceId: string;
  channel: { id: string; type: string; secretsEnc?: string | null };
  contact: { channels: { type: string; externalId: string }[] };
};

export async function deliverOutbound(conv: Conv, body: string) {
  if (conv.channel.type === "telegram") {
    const token = await channelToken(conv.channel.id);
    const ext = conv.contact.channels.find((c) => c.type === "telegram");
    if (token && ext) {
      try {
        await telegramSend(token, ext.externalId, body);
      } catch {
        /* текст всё равно кладём во входящие */
      }
    }
  }
  if (conv.channel.type === "email") {
    const secrets = parseEmailSecrets(conv.channel.secretsEnc);
    const to = conv.contact.channels.find((c) => c.type === "email")?.externalId;
    if (secrets.smtpHost && secrets.fromAddress && to) {
      try {
        await sendSmtp({
          host: secrets.smtpHost,
          port: secrets.smtpPort,
          user: secrets.smtpUser,
          pass: secrets.smtpPass,
          from: secrets.fromAddress,
          to,
          subject: "Ответ по заявке",
          text: body,
        });
      } catch {
        /* ответ всё равно во входящих */
      }
    }
  }
  return prisma.message.create({
    data: {
      workspaceId: conv.workspaceId,
      conversationId: conv.id,
      direction: "outbound",
      body,
      sentAt: new Date(),
    },
  });
}
