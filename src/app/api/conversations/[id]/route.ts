import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { deliverOutbound } from "@/lib/outbound";
import { logActivity } from "@/lib/activity";
import { z } from "zod";
import { dlpContact, dlpMessageBody } from "@/lib/dlp";
import { extractPhotoRefs } from "@/lib/photos";
import { getCbrRates } from "@/lib/cbr";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: {
        contact: { include: { channels: true, leads: true, fieldValues: { include: { field: true } } } },
        channel: true,
        assignee: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" } },
        leads: { select: { id: true, status: true } },
      },
    });
    if (!conv) return jsonError("Диалог не найден", 404);
    await prisma.conversation.update({ where: { id }, data: { unread: false } });
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: session.workspaceId },
      include: { user: true },
    });
    return NextResponse.json({
      ...conv,
      contact: dlpContact(session.role, conv.contact),
      messages: conv.messages
        .filter((m) => m.direction !== "internal" && m.direction !== "note")
        .map((m) => ({ ...m, body: dlpMessageBody(session.role, m.body) })),
      operators: members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
      fx: await getCbrRates(),
      photos: extractPhotoRefs(
        [
          ...(conv.messages || []).map((m) => m.body),
          ...(conv.contact.fieldValues || []).map((v) => v.value),
        ].join("\n"),
      ),
    });
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: { channel: true, contact: { include: { channels: true } } },
    });
    if (!conv) return jsonError("Диалог не найден", 404);
    const parsed = z
      .object({
        text: z.string().min(1),
        send: z.boolean().optional(),
        draftId: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен текст");

    let body = parsed.data.text;
    if (parsed.data.draftId) {
      const draft = await prisma.message.findFirst({
        where: { id: parsed.data.draftId, conversationId: id, direction: "draft" },
      });
      if (draft) body = parsed.data.text || draft.body;
    }

    if (parsed.data.send) {
      const msg = await deliverOutbound(conv, body);
      await prisma.conversation.update({
        where: { id },
        data: {
          status: "manager",
          assigneeId: session.userId,
          unread: false,
          ...(conv.pingDraftedAt && !conv.pingSentAt ? { pingSentAt: new Date() } : {}),
        },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "send",
        message: body.slice(0, 160),
      });
      return NextResponse.json({ message: msg, sent: true });
    }

    const msg = await prisma.message.create({
      data: {
        workspaceId: session.workspaceId,
        conversationId: id,
        direction: "draft",
        body,
      },
    });
    return NextResponse.json({ message: msg, sent: false });
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const conv = await prisma.conversation.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: { channel: true, contact: { include: { channels: true } } },
    });
    if (!conv) return jsonError("Диалог не найден", 404);
    const parsed = z
      .object({
        action: z.enum([
          "take",
          "reset",
          "close",
          "ai",
          "redirect",
          "pin",
          "unpin",
          "snooze",
          "unsnooze",
          "archive",
          "unarchive",
        ]),
        userId: z.string().optional(),
        until: z.string().datetime().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужно действие");

    if (parsed.data.action === "snooze") {
      const untilRaw = parsed.data.until;
      if (!untilRaw) return jsonError("Нужно время отложки");
      const until = new Date(untilRaw);
      if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        return jsonError("Время отложки должно быть в будущем");
      }
      const updated = await prisma.conversation.update({
        where: { id },
        data: { snoozedUntil: until, archived: false, unread: false },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "snooze",
        message: `Отложили до ${until.toLocaleString("ru-RU")}`,
      });
      return NextResponse.json({ conversation: updated });
    }

    if (parsed.data.action === "unsnooze") {
      const updated = await prisma.conversation.update({
        where: { id },
        data: { snoozedUntil: null },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "snooze",
        message: "Сняли отложку",
      });
      return NextResponse.json({ conversation: updated });
    }

    if (parsed.data.action === "archive") {
      const updated = await prisma.conversation.update({
        where: { id },
        data: { archived: true, snoozedUntil: null, unread: false },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "archive",
        message: "Диалог в архиве",
      });
      return NextResponse.json({ conversation: updated });
    }

    if (parsed.data.action === "unarchive") {
      const updated = await prisma.conversation.update({
        where: { id },
        data: { archived: false },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "archive",
        message: "Вернули из архива",
      });
      return NextResponse.json({ conversation: updated });
    }

    if (parsed.data.action === "pin" || parsed.data.action === "unpin") {
      const pinned = parsed.data.action === "pin";
      const updated = await prisma.conversation.update({
        where: { id },
        data: { pinned },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "pin",
        message: pinned ? "Диалог закрепили" : "Диалог открепили",
      });
      return NextResponse.json({ conversation: updated });
    }

    if (parsed.data.action === "take") {
      const updated = await prisma.conversation.update({
        where: { id },
        data: { status: "manager", assigneeId: session.userId, unread: false },
      });
      const lead = await prisma.lead.findFirst({ where: { conversationId: id } });
      if (lead) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { assigneeId: session.userId, status: lead.status === "new" ? "in_progress" : lead.status },
        });
      }
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "take",
        message: "Взяли диалог",
      });
      return NextResponse.json({ conversation: updated });
    }

    if (parsed.data.action === "redirect") {
      if (!parsed.data.userId) return jsonError("Нужен сотрудник");
      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: session.workspaceId, userId: parsed.data.userId },
        include: { user: true },
      });
      if (!member) return jsonError("Нет такого в команде", 404);
      const updated = await prisma.conversation.update({
        where: { id },
        data: { status: "manager", assigneeId: member.userId, unread: true },
      });
      const lead = await prisma.lead.findFirst({ where: { conversationId: id } });
      if (lead) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { assigneeId: member.userId, status: lead.status === "new" ? "in_progress" : lead.status },
        });
      }
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "redirect",
        message: `Перенаправили ${member.user.name}`,
      });
      return NextResponse.json({ conversation: updated });
    }

    if (parsed.data.action === "reset") {
      await prisma.message.create({
        data: {
          workspaceId: session.workspaceId,
          conversationId: id,
          direction: "system",
          body: "Сессия сброшена. Новый заход, старый расчёт не подмешиваем.",
        },
      });
      const updated = await prisma.conversation.update({
        where: { id },
        data: {
          status: "ai",
          urgent: false,
          urgentReason: null,
          aiError: null,
          unread: false,
          pingDraftedAt: null,
          pingSentAt: null,
        },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "reset",
        message: "Сессия сброшена, клиенту ничего не ушло",
      });
      return NextResponse.json({ conversation: updated, reset: true });
    }

    if (parsed.data.action === "close") {
      const updated = await prisma.conversation.update({
        where: { id },
        data: { status: "closed", unread: false },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        conversationId: id,
        actor: session.name,
        event: "close",
        message: "Диалог закрыт",
      });
      return NextResponse.json({ conversation: updated });
    }

    const last =
      (await prisma.message.findFirst({
        where: { conversationId: id, direction: "outbound" },
        orderBy: { createdAt: "desc" },
      })) ||
      (await prisma.message.findFirst({
        where: { conversationId: id, direction: "draft" },
        orderBy: { createdAt: "desc" },
      }));
    let resent = false;
    if (last) {
      await deliverOutbound(conv, last.body);
      resent = true;
    }
    const updated = await prisma.conversation.update({
      where: { id },
      data: { status: "ai", unread: false },
    });
    await logActivity({
      workspaceId: session.workspaceId,
      conversationId: id,
      actor: session.name,
      event: "ai",
      message: resent ? "Вернули ИИ, последний ответ ушёл клиенту" : "Вернули ИИ",
    });
    return NextResponse.json({ conversation: updated, resent });
  });
}
