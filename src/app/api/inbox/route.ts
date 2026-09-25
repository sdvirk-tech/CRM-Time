import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { isStale, lastByDirection } from "@/lib/sla";
import { dlpContact, dlpMessageBody } from "@/lib/dlp";
import { releaseExpiredSnoozes } from "@/lib/snooze";
import { cargoBagFromFieldValues, isLeadHot } from "@/lib/lead-hot";

export async function GET(req: Request) {
  return withSession(async (session) => {
    await releaseExpiredSnoozes(session.workspaceId);
    const view = new URL(req.url).searchParams.get("view") || "active";
    const now = new Date();
    const slaMinutes =
      (await prisma.workspace.findUnique({ where: { id: session.workspaceId } }))?.slaMinutes ?? 15;
    const where =
      view === "archived"
        ? { workspaceId: session.workspaceId, archived: true }
        : view === "snoozed"
          ? {
              workspaceId: session.workspaceId,
              archived: false,
              snoozedUntil: { gt: now },
            }
          : {
              workspaceId: session.workspaceId,
              archived: false,
              OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
            };
    const items = await prisma.conversation.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { urgent: "desc" }, { updatedAt: "desc" }],
      include: {
        contact: { include: { fieldValues: { include: { field: true } } } },
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
      const leadStatus = i.leads[0]?.status ?? null;
      const bag = cargoBagFromFieldValues(i.contact.fieldValues);
      const clientReplied = i.messages.some((m) => m.direction === "inbound");
      const hot =
        leadStatus &&
        isLeadHot({
          status: leadStatus,
          bag,
          name: i.contact.name,
          phone: i.contact.phone,
          clientReplied,
        });
      return {
        id: i.id,
        status: i.status,
        assigneeId: i.assigneeId,
        unread: i.unread,
        pinned: i.pinned,
        archived: i.archived,
        snoozedUntil: i.snoozedUntil,
        urgent: i.urgent,
        urgentReason: i.urgentReason,
        stale,
        pingDrafted: Boolean(i.pingDraftedAt),
        pingSent: Boolean(i.pingSentAt),
        aiError: i.aiError,
        cardReady: i.leads.length > 0,
        leadId: i.leads[0]?.id ?? null,
        leadStatus,
        hot: Boolean(hot),
        contact: dlpContact(session.role, { id: i.contact.id, name: i.contact.name, phone: i.contact.phone }),
        channel: { type: i.channel.type, name: i.channel.name },
        lastMessage: dlpMessageBody(session.role, i.messages[0]?.body ?? ""),
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
