import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: { channel: true },
    });
    if (!conv) return jsonError("Диалог не найден", 404);
    const existing = await prisma.lead.findFirst({
      where: { conversationId: id, workspaceId: session.workspaceId },
    });
    if (existing) return NextResponse.json({ lead: existing, existed: true });
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
    return NextResponse.json({ lead });
  });
}
