import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { isStale, lastByDirection } from "@/lib/sla";

export async function GET() {
  return withSession(async (session) => {
    const slaMinutes =
      (await prisma.workspace.findUnique({ where: { id: session.workspaceId } }))?.slaMinutes ?? 15;
    const items = await prisma.conversation.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: [{ urgent: "desc" }, { updatedAt: "desc" }],
      include: {
        contact: true,
        channel: true,
        leads: { select: { id: true, status: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 12 },
      },
    });
    const mapped = items.map((i) => {
      const lastIn = lastByDirection(i.messages, "inbound");
      const lastOut = lastByDirection(i.messages, "outbound");
      const stale = isStale({
        status: i.status,
        slaMinutes,
        lastInboundAt: lastIn?.createdAt,
        lastOutboundAt: lastOut?.createdAt,
      });
      return {
        id: i.id,
        status: i.status,
        assigneeId: i.assigneeId,
        unread: i.unread,
        urgent: i.urgent,
        urgentReason: i.urgentReason,
        stale,
        pingDrafted: Boolean(i.pingDraftedAt),
        pingSent: Boolean(i.pingSentAt),
        aiError: i.aiError,
        cardReady: i.leads.length > 0,
        leadId: i.leads[0]?.id ?? null,
        leadStatus: i.leads[0]?.status ?? null,
        contact: { id: i.contact.id, name: i.contact.name, phone: i.contact.phone },
        channel: { type: i.channel.type, name: i.channel.name },
        lastMessage: i.messages[0]?.body ?? "",
        updatedAt: i.updatedAt,
      };
    });
    return NextResponse.json({
      unread: mapped.filter((i) => i.unread).length,
      stale: mapped.filter((i) => i.stale).length,
      slaMinutes,
      items: mapped,
    });
  });
}
