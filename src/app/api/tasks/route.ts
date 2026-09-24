import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { listOverdue, mapTask } from "@/lib/tasks";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const url = new URL(req.url);
    const leadId = url.searchParams.get("leadId")?.trim() || "";
    const overdue = url.searchParams.get("overdue") === "1";
    if (overdue) {
      return NextResponse.json({ items: await listOverdue(session.workspaceId) });
    }
    const items = await prisma.followUp.findMany({
      where: {
        workspaceId: session.workspaceId,
        ...(leadId ? { leadId } : {}),
      },
      orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }],
      include: {
        assignee: { select: { id: true, name: true } },
        lead: { include: { contact: { select: { name: true } } } },
      },
    });
    return NextResponse.json({ items: items.map(mapTask) });
  });
}

export async function POST(req: Request) {
  return withSession(async (session) => {
    const parsed = z
      .object({
        leadId: z.string().min(1),
        title: z.string().trim().min(1).max(120),
        dueAt: z.string().min(1),
        assigneeId: z.string().min(1).optional().nullable(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужны название и срок");
    const dueAt = new Date(parsed.data.dueAt);
    if (Number.isNaN(dueAt.getTime())) return jsonError("Некорректный срок");
    const lead = await prisma.lead.findFirst({
      where: { id: parsed.data.leadId, workspaceId: session.workspaceId },
      include: { contact: { select: { name: true } } },
    });
    if (!lead) return jsonError("Лид не найден", 404);
    let assigneeId = parsed.data.assigneeId || null;
    if (assigneeId) {
      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: session.workspaceId, userId: assigneeId },
      });
      if (!member) return jsonError("Нет такого в команде", 404);
    }
    const item = await prisma.followUp.create({
      data: {
        workspaceId: session.workspaceId,
        leadId: lead.id,
        title: parsed.data.title,
        dueAt,
        assigneeId,
      },
      include: {
        assignee: { select: { id: true, name: true } },
        lead: { include: { contact: { select: { name: true } } } },
      },
    });
    await logActivity({
      workspaceId: session.workspaceId,
      leadId: lead.id,
      contactId: lead.contactId,
      conversationId: lead.conversationId,
      actor: session.name,
      event: "task",
      message: `Задача «${item.title}» на ${dueAt.toLocaleString("ru-RU")}`,
    });
    return NextResponse.json({ item: mapTask(item) });
  });
}
