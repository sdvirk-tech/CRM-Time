import { prisma } from "./prisma";
import { channelToken, telegramSend } from "./telegram";

type Conv = {
  id: string;
  workspaceId: string;
  channel: { id: string; type: string };
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
