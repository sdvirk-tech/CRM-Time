import { prisma } from "./prisma";
import { channelToken, telegramSend } from "./telegram";
import { notifyLeadWebhook } from "./webhook";
import { emailManagerOnAssign } from "./assign-email";

export async function notifyNewLead(opts: {
  workspaceId: string;
  leadId: string;
  contactId: string;
  contactName: string;
  assigneeId?: string | null;
  source?: string;
  phone?: string | null;
}) {
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: opts.workspaceId },
      include: { user: true },
    });
    const recipients = members.filter((m) => m.role === "owner" || m.userId === opts.assigneeId);
    const seen = new Set<string>();
    const title = "Новый лид";
    const body = `${opts.contactName || "Контакт"} — статус Новый`;
    const href = `/leads/${opts.leadId}`;
    let tgToken: string | null = null;
    const tgChannel = await prisma.channel.findFirst({
      where: { workspaceId: opts.workspaceId, type: "telegram", enabled: true },
    });
    if (tgChannel) tgToken = await channelToken(tgChannel.id);

    for (const m of recipients) {
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      await prisma.notification.create({
        data: {
          workspaceId: opts.workspaceId,
          userId: m.userId,
          type: "lead_new",
          title,
          body,
          href,
          leadId: opts.leadId,
          contactId: opts.contactId,
        },
      });
      const chat = (m.telegram || "").trim();
      if (tgToken && chat) {
        const chatId = chat.replace(/^@/, "");
        await telegramSend(tgToken, chatId, `CRM-Time: ${title}. ${body} ${href}`).catch(() => null);
      }
    }
  } catch {
    /* колокольчик не должен ронять ingest */
  }
  if (opts.assigneeId) {
    try {
      await emailManagerOnAssign({
        workspaceId: opts.workspaceId,
        leadId: opts.leadId,
        assigneeId: opts.assigneeId,
        previousAssigneeId: null,
      });
    } catch {
      /* почта не должна ронять ingest */
    }
  }
  try {
    await notifyLeadWebhook({
      workspaceId: opts.workspaceId,
      leadId: opts.leadId,
      contactId: opts.contactId,
      contactName: opts.contactName,
      source: opts.source || "web_form",
      phone: opts.phone,
    });
  } catch {
    /* исходящий webhook не должен ронять ingest */
  }
}
