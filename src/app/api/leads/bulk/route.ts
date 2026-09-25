import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { leadStatusLabel } from "@/lib/labels";
import { ensureTag } from "@/lib/tags";
import { emailManagerOnAssign } from "@/lib/assign-email";

export async function POST(req: Request) {
  return withSession(async (session) => {
    const parsed = z
      .object({
        leadIds: z.array(z.string()).min(1).max(200),
        action: z.enum(["tag", "assign", "status"]),
        tagName: z.string().optional(),
        assigneeId: z.string().nullable().optional(),
        status: z.enum(["new", "in_progress", "qualified", "rejected"]).optional(),
        rejectReason: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");

    const leads = await prisma.lead.findMany({
      where: { workspaceId: session.workspaceId, id: { in: parsed.data.leadIds } },
    });
    if (leads.length !== parsed.data.leadIds.length) return jsonError("Не все лиды найдены", 404);

    if (parsed.data.action === "tag") {
      const name = (parsed.data.tagName || "").trim();
      if (name.length < 1 || name.length > 40) return jsonError("Нужно имя метки");
      const tag = await ensureTag(session.workspaceId, name);
      for (const lead of leads) {
        await prisma.leadTag.upsert({
          where: { leadId_tagId: { leadId: lead.id, tagId: tag.id } },
          create: { workspaceId: session.workspaceId, leadId: lead.id, tagId: tag.id },
          update: {},
        });
        await logActivity({
          workspaceId: session.workspaceId,
          leadId: lead.id,
          contactId: lead.contactId,
          conversationId: lead.conversationId,
          actor: session.name,
          event: "tag",
          message: `Метка «${name}» (массово)`,
        });
      }
      return NextResponse.json({ ok: true, updated: leads.length, tag: { id: tag.id, name: tag.name } });
    }

    if (parsed.data.action === "assign") {
      const assigneeId = parsed.data.assigneeId ?? null;
      if (assigneeId) {
        const member = await prisma.workspaceMember.findFirst({
          where: { workspaceId: session.workspaceId, userId: assigneeId },
          include: { user: true },
        });
        if (!member) return jsonError("Нет такого сотрудника", 404);
      }
      for (const lead of leads) {
        const prev = lead.assigneeId;
        await prisma.lead.update({
          where: { id: lead.id },
          data: { assigneeId },
        });
        if (assigneeId) {
          await emailManagerOnAssign({
            workspaceId: session.workspaceId,
            leadId: lead.id,
            assigneeId,
            previousAssigneeId: prev,
          });
        }
        await logActivity({
          workspaceId: session.workspaceId,
          leadId: lead.id,
          contactId: lead.contactId,
          conversationId: lead.conversationId,
          actor: session.name,
          event: "status",
          message: assigneeId ? "Назначили менеджера (массово)" : "Сняли назначение (массово)",
        });
      }
      return NextResponse.json({ ok: true, updated: leads.length, assigneeId });
    }

    const status = parsed.data.status;
    if (!status) return jsonError("Нужен статус");
    const reason = (parsed.data.rejectReason || "").trim();
    if (status === "rejected" && (reason.length < 2 || reason.length > 280)) {
      return jsonError("Нужна причина отказа");
    }
    for (const lead of leads) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status,
          ...(status === "rejected" ? { rejectReason: reason } : {}),
        },
      });
      await logActivity({
        workspaceId: session.workspaceId,
        leadId: lead.id,
        contactId: lead.contactId,
        conversationId: lead.conversationId,
        actor: session.name,
        event: "status",
        message: `${leadStatusLabel(lead.status)} → ${leadStatusLabel(status)}${status === "rejected" ? ` · ${reason}` : ""} (массово)`,
      });
    }
    return NextResponse.json({ ok: true, updated: leads.length, status });
  });
}
