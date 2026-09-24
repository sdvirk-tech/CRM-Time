import { prisma } from "./prisma";

export async function logActivity(opts: {
  workspaceId: string;
  conversationId?: string | null;
  channelId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  actor: string;
  event: string;
  message: string;
}) {
  try {
    let contactId = opts.contactId || null;
    let leadId = opts.leadId || null;
    if (opts.conversationId && (!contactId || !leadId)) {
      const conv = await prisma.conversation.findFirst({
        where: { id: opts.conversationId, workspaceId: opts.workspaceId },
        include: { leads: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (conv) {
        contactId = contactId || conv.contactId;
        leadId = leadId || conv.leads[0]?.id || null;
      }
    }
    await prisma.activityEvent.create({
      data: {
        workspaceId: opts.workspaceId,
        conversationId: opts.conversationId || undefined,
        channelId: opts.channelId || undefined,
        contactId: contactId || undefined,
        leadId: leadId || undefined,
        actor: opts.actor,
        event: opts.event,
        message: opts.message.slice(0, 500),
      },
    });
  } catch {
    /* журнал не должен ронять цепочку */
  }
}

export async function listTimeline(opts: {
  workspaceId: string;
  contactId?: string;
  leadId?: string;
  take?: number;
}) {
  const or: Record<string, unknown>[] = [];
  if (opts.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: opts.leadId, workspaceId: opts.workspaceId },
      select: { id: true, contactId: true, conversationId: true },
    });
    if (!lead) return [];
    or.push({ leadId: lead.id });
    if (lead.conversationId) or.push({ conversationId: lead.conversationId });
    or.push({ contactId: lead.contactId, event: { in: ["consent", "merge"] } });
  } else if (opts.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: opts.contactId, workspaceId: opts.workspaceId },
      select: { id: true, leads: { select: { id: true } }, conversations: { select: { id: true } } },
    });
    if (!contact) return [];
    or.push({ contactId: contact.id });
    if (contact.leads.length) or.push({ leadId: { in: contact.leads.map((l) => l.id) } });
    if (contact.conversations.length) or.push({ conversationId: { in: contact.conversations.map((c) => c.id) } });
  } else {
    return [];
  }
  return prisma.activityEvent.findMany({
    where: { workspaceId: opts.workspaceId, OR: or },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 40,
  });
}
