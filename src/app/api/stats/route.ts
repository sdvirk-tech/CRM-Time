import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { isStale, lastByDirection, startOfToday } from "@/lib/sla";

export async function GET() {
  return withSession(async (session) => {
    const ws = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    const slaMinutes = ws?.slaMinutes ?? 15;
    const today = startOfToday();
    const [unread, newLeads, urgent, inboundToday, leadsToday, outboundToday, conversations] = await Promise.all([
      prisma.conversation.count({ where: { workspaceId: session.workspaceId, unread: true } }),
      prisma.lead.count({ where: { workspaceId: session.workspaceId, status: "new" } }),
      prisma.conversation.count({ where: { workspaceId: session.workspaceId, urgent: true } }),
      prisma.message.count({
        where: { workspaceId: session.workspaceId, direction: "inbound", createdAt: { gte: today } },
      }),
      prisma.lead.count({ where: { workspaceId: session.workspaceId, createdAt: { gte: today } } }),
      prisma.message.count({
        where: { workspaceId: session.workspaceId, direction: "outbound", createdAt: { gte: today } },
      }),
      prisma.conversation.findMany({
        where: { workspaceId: session.workspaceId, status: { not: "closed" } },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 12 } },
      }),
    ]);
    const stale = conversations.filter((c) =>
      isStale({
        status: c.status,
        slaMinutes,
        lastInboundAt: lastByDirection(c.messages, "inbound")?.createdAt,
        lastOutboundAt: lastByDirection(c.messages, "outbound")?.createdAt,
      }),
    ).length;
    return NextResponse.json({
      unread,
      newLeads,
      urgent,
      stale,
      slaMinutes,
      today: { inbound: inboundToday, leads: leadsToday, outbound: outboundToday },
      role: session.role,
    });
  });
}
