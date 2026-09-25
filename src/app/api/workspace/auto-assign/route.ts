import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { channelRuleOk, listAutoAssignRules } from "@/lib/auto-assign";
import { z } from "zod";

export async function GET() {
  return withSession(async (session) => {
    return NextResponse.json({ rules: await listAutoAssignRules(session.workspaceId) });
  });
}

const ruleSchema = z.object({
  channel: z.enum(["telegram", "web_form", "web_chat", "email"]).nullable().optional(),
  tagName: z.string().trim().max(40).nullable().optional(),
  assigneeId: z.string().min(1),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  enabled: z.boolean().optional(),
});

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = ruleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректное правило");
    const channel = parsed.data.channel ?? null;
    const tagName = parsed.data.tagName?.trim() || null;
    if (!channel && !tagName) return jsonError("Укажите канал или метку");
    if (channel && !channelRuleOk(channel)) return jsonError("Неизвестный канал");

    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: session.workspaceId, userId: parsed.data.assigneeId },
    });
    if (!member) return jsonError("Менеджер не в команде", 404);

    const maxOrder = await prisma.autoAssignRule.aggregate({
      where: { workspaceId: session.workspaceId },
      _max: { sortOrder: true },
    });
    const rule = await prisma.autoAssignRule.create({
      data: {
        workspaceId: session.workspaceId,
        channel,
        tagName,
        assigneeId: parsed.data.assigneeId,
        sortOrder: parsed.data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
        enabled: parsed.data.enabled ?? true,
      },
    });
    return NextResponse.json({ ok: true, rule: { id: rule.id } });
  });
}

export async function PATCH(req: Request) {
  return withOwner(async (session) => {
    const body = await req.json().catch(() => null);
    const parsed = z
      .object({
        id: z.string().min(1),
        channel: z.enum(["telegram", "web_form", "web_chat", "email"]).nullable().optional(),
        tagName: z.string().trim().max(40).nullable().optional(),
        assigneeId: z.string().min(1).optional(),
        sortOrder: z.coerce.number().int().min(0).max(999).optional(),
        enabled: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success) return jsonError("Некорректные данные");
    const existing = await prisma.autoAssignRule.findFirst({
      where: { id: parsed.data.id, workspaceId: session.workspaceId },
    });
    if (!existing) return jsonError("Правило не найдено", 404);

    const channel = parsed.data.channel !== undefined ? parsed.data.channel : existing.channel;
    const tagName = parsed.data.tagName !== undefined ? parsed.data.tagName?.trim() || null : existing.tagName;
    if (!channel && !tagName) return jsonError("Укажите канал или метку");

    if (parsed.data.assigneeId) {
      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: session.workspaceId, userId: parsed.data.assigneeId },
      });
      if (!member) return jsonError("Менеджер не в команде", 404);
    }

    await prisma.autoAssignRule.update({
      where: { id: existing.id },
      data: {
        channel,
        tagName,
        assigneeId: parsed.data.assigneeId,
        sortOrder: parsed.data.sortOrder,
        enabled: parsed.data.enabled,
      },
    });
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return withOwner(async (session) => {
    const parsed = z.object({ id: z.string().min(1) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен id");
    await prisma.autoAssignRule.deleteMany({
      where: { id: parsed.data.id, workspaceId: session.workspaceId },
    });
    return NextResponse.json({ ok: true });
  });
}
