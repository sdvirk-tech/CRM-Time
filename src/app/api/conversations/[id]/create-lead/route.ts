import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { notifyNewLead } from "@/lib/notify";
import { findOpenDuplicateLeads } from "@/lib/duplicate-leads";
import { applyAutoAssignRules } from "@/lib/auto-assign";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = z.object({ force: z.boolean().optional() }).safeParse(body);
    const force = parsed.success && parsed.data.force === true;

    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: { channel: true, contact: true },
    });
    if (!conv) return jsonError("Диалог не найден", 404);
    const existing = await prisma.lead.findFirst({
      where: { conversationId: id, workspaceId: session.workspaceId },
    });
    if (existing) return NextResponse.json({ lead: existing, existed: true });

    const tgChannel = await prisma.contactChannel.findFirst({
      where: { workspaceId: session.workspaceId, contactId: conv.contactId, type: "telegram" },
    });
    const dups = await findOpenDuplicateLeads(session.workspaceId, {
      phone: conv.contact.phone,
      telegramExternalId: tgChannel?.externalId,
      contactId: conv.contactId,
    });
    if (dups.length && !force) {
      return NextResponse.json(
        {
          duplicateWarning: true,
          duplicates: dups,
          message: "У контакта уже есть открытый лид «Новый» или «В работе». Подтвердите создание второго.",
        },
        { status: 409 },
      );
    }

    const lead = await prisma.lead.create({
      data: {
        workspaceId: session.workspaceId,
        contactId: conv.contactId,
        conversationId: conv.id,
        status: "new",
        source: conv.channel.type === "web_form" || conv.channel.type === "web_chat" || conv.channel.type === "email"
          ? conv.channel.type
          : "telegram",
        urgent: conv.urgent,
        assigneeId: session.userId,
      },
    });
    await applyAutoAssignRules(session.workspaceId, lead.id);
    const leadFresh = await prisma.lead.findUnique({ where: { id: lead.id } });
    const contact = await prisma.contact.findUnique({ where: { id: conv.contactId } });
    await notifyNewLead({
      workspaceId: session.workspaceId,
      leadId: lead.id,
      contactId: conv.contactId,
      contactName: contact?.name || "Контакт",
      assigneeId: leadFresh?.assigneeId ?? session.userId,
      source: lead.source,
      phone: contact?.phone,
    });
    return NextResponse.json({ lead: leadFresh ?? lead });
  });
}
