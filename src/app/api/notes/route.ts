import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { maskPii, shouldMask } from "@/lib/dlp";
import { z } from "zod";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const url = new URL(req.url);
    const leadId = url.searchParams.get("leadId") || undefined;
    const conversationId = url.searchParams.get("conversationId") || undefined;
    if (!leadId && !conversationId) return jsonError("Нужен leadId или conversationId");
    if (leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: session.workspaceId } });
      if (!lead) return jsonError("Лид не найден", 404);
    }
    if (conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, workspaceId: session.workspaceId },
      });
      if (!conv) return jsonError("Диалог не найден", 404);
    }
    const items = await prisma.internalNote.findMany({
      where: {
        workspaceId: session.workspaceId,
        ...(leadId ? { leadId } : {}),
        ...(conversationId ? { conversationId } : {}),
      },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const mask = shouldMask(session.role);
    return NextResponse.json({
      items: items.map((n) => ({
        id: n.id,
        body: mask ? maskPii(n.body) : n.body,
        author: n.author.name,
        createdAt: n.createdAt,
        leadId: n.leadId,
        conversationId: n.conversationId,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withSession(async (session) => {
    const parsed = z
      .object({
        body: z.string().trim().min(1).max(4000),
        leadId: z.string().optional(),
        conversationId: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен текст заметки");
    if (!parsed.data.leadId && !parsed.data.conversationId) return jsonError("Нужен лид или диалог");
    let contactId: string | null = null;
    let leadId = parsed.data.leadId || null;
    let conversationId = parsed.data.conversationId || null;
    if (leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: session.workspaceId } });
      if (!lead) return jsonError("Лид не найден", 404);
      contactId = lead.contactId;
      conversationId = conversationId || lead.conversationId;
    }
    if (conversationId) {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, workspaceId: session.workspaceId },
        include: { leads: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } } },
      });
      if (!conv) return jsonError("Диалог не найден", 404);
      contactId = contactId || conv.contactId;
      leadId = leadId || conv.leads[0]?.id || null;
    }
    const note = await prisma.internalNote.create({
      data: {
        workspaceId: session.workspaceId,
        leadId,
        conversationId,
        contactId,
        authorId: session.userId,
        body: parsed.data.body,
      },
      include: { author: { select: { name: true } } },
    });
    await logActivity({
      workspaceId: session.workspaceId,
      leadId,
      conversationId,
      contactId,
      actor: session.name,
      event: "note",
      message: parsed.data.body.slice(0, 160),
    });
    return NextResponse.json({
      note: {
        id: note.id,
        body: note.body,
        author: note.author.name,
        createdAt: note.createdAt,
        leadId: note.leadId,
        conversationId: note.conversationId,
      },
    });
  });
}
