import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { isStale, lastByDirection, startOfToday } from "@/lib/sla";

export async function GET() {
  return withSession(async (session) => {
    const ws = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    const slaMinutes = ws?.slaMinutes ?? 15;
    const today = startOfToday();
    const [unread, newLeads, urgent, inboundToday, leadsToday, outboundToday, conversations, leads, members] =
      await Promise.all([
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
        prisma.lead.findMany({
          where: { workspaceId: session.workspaceId },
          select: { status: true, assigneeId: true },
        }),
        prisma.workspaceMember.findMany({
          where: { workspaceId: session.workspaceId },
          include: { user: { select: { id: true, name: true } } },
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
    const funnel = { new: 0, in_progress: 0, qualified: 0, rejected: 0 };
    for (const l of leads) {
      if (l.status === "new") funnel.new += 1;
      else if (l.status === "in_progress") funnel.in_progress += 1;
      else if (l.status === "qualified") funnel.qualified += 1;
      else if (l.status === "rejected" || l.status === "lost") funnel.rejected += 1;
    }
    const taken = funnel.in_progress + funnel.qualified + funnel.rejected;
    const conversion = taken ? Math.round((funnel.qualified / taken) * 100) : 0;
    const managers = members.map((m) => {
      const mine = leads.filter((l) => l.assigneeId === m.userId);
      const take = mine.filter((l) => l.status !== "new").length;
      const qual = mine.filter((l) => l.status === "qualified").length;
      return {
        userId: m.userId,
        name: m.user.name,
        role: m.role,
        assigned: mine.length,
        taken: take,
        qualified: qual,
        conversion: take ? Math.round((qual / take) * 100) : 0,
      };
    });
    return NextResponse.json({
      unread,
      newLeads,
      urgent,
      stale,
      slaMinutes,
      today: { inbound: inboundToday, leads: leadsToday, outbound: outboundToday },
      funnel,
      conversion,
      taken,
      managers,
      role: session.role,
    });
  });
}
