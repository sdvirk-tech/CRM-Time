import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";

export async function GET() {
  return withSession(async (session) => {
    const items = await prisma.conversation.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: [{ urgent: "desc" }, { updatedAt: "desc" }],
      include: {
        contact: true,
        channel: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    const unread = items.filter((i) => i.unread).length;
    return NextResponse.json({
      unread,
      items: items.map((i) => ({
        id: i.id,
        status: i.status,
        assigneeId: i.assigneeId,
        unread: i.unread,
        urgent: i.urgent,
        urgentReason: i.urgentReason,
        aiError: i.aiError,
        contact: { id: i.contact.id, name: i.contact.name, phone: i.contact.phone },
        channel: { type: i.channel.type, name: i.channel.name },
        lastMessage: i.messages[0]?.body ?? "",
        updatedAt: i.updatedAt,
      })),
    });
  });
}
