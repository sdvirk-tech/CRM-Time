import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { mapTask } from "@/lib/tasks";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const existing = await prisma.followUp.findFirst({
      where: { id, workspaceId: session.workspaceId },
    });
    if (!existing) return jsonError("Задача не найдена", 404);
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(120).optional(),
        dueAt: z.string().optional(),
        assigneeId: z.string().min(1).nullable().optional(),
        done: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const data: {
      title?: string;
      dueAt?: Date;
      assigneeId?: string | null;
      doneAt?: Date | null;
    } = {};
    if (parsed.data.title) data.title = parsed.data.title;
    if (parsed.data.dueAt) {
      const dueAt = new Date(parsed.data.dueAt);
      if (Number.isNaN(dueAt.getTime())) return jsonError("Некорректный срок");
      data.dueAt = dueAt;
    }
    if (parsed.data.assigneeId !== undefined) {
      if (parsed.data.assigneeId) {
        const member = await prisma.workspaceMember.findFirst({
          where: { workspaceId: session.workspaceId, userId: parsed.data.assigneeId },
        });
        if (!member) return jsonError("Нет такого в команде", 404);
      }
      data.assigneeId = parsed.data.assigneeId;
    }
    if (parsed.data.done === true) data.doneAt = existing.doneAt || new Date();
    if (parsed.data.done === false) data.doneAt = null;
    const item = await prisma.followUp.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, name: true } },
        lead: { include: { contact: { select: { name: true } } } },
      },
    });
    if (parsed.data.done === true && !existing.doneAt) {
      await logActivity({
        workspaceId: session.workspaceId,
        leadId: existing.leadId,
        actor: session.name,
        event: "task",
        message: `Задача «${item.title}» закрыта`,
      });
    }
    return NextResponse.json({ item: mapTask(item) });
  });
}
