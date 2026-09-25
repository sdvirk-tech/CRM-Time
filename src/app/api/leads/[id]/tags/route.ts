import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { applyAutoAssignRules } from "@/lib/auto-assign";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

async function leadTags(workspaceId: string, leadId: string) {
  const rows = await prisma.leadTag.findMany({
    where: { workspaceId, leadId },
    include: { tag: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.tag.id, name: r.tag.name }));
}

export async function POST(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const lead = await prisma.lead.findFirst({ where: { id, workspaceId: session.workspaceId } });
    if (!lead) return jsonError("Лид не найден", 404);
    const parsed = z
      .object({ name: z.string().trim().min(1).max(40).optional(), tagId: z.string().optional() })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success || (!parsed.data.name && !parsed.data.tagId)) return jsonError("Нужна метка");
    let tag = parsed.data.tagId
      ? await prisma.tag.findFirst({ where: { id: parsed.data.tagId, workspaceId: session.workspaceId } })
      : await prisma.tag.findFirst({
          where: { workspaceId: session.workspaceId, name: { equals: parsed.data.name!, mode: "insensitive" } },
        });
    if (!tag && parsed.data.name) {
      tag = await prisma.tag.create({ data: { workspaceId: session.workspaceId, name: parsed.data.name } });
    }
    if (!tag) return jsonError("Метка не найдена", 404);
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
      message: `Метка «${tag.name}»`,
    });
    if (lead.status === "new" || lead.status === "in_progress") {
      await applyAutoAssignRules(session.workspaceId, lead.id);
    }
    return NextResponse.json({ ok: true, tags: await leadTags(session.workspaceId, lead.id) });
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const lead = await prisma.lead.findFirst({ where: { id, workspaceId: session.workspaceId } });
    if (!lead) return jsonError("Лид не найден", 404);
    const parsed = z.object({ tagId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен tagId");
    await prisma.leadTag.deleteMany({
      where: { workspaceId: session.workspaceId, leadId: lead.id, tagId: parsed.data.tagId },
    });
    return NextResponse.json({ ok: true, tags: await leadTags(session.workspaceId, lead.id) });
  });
}
