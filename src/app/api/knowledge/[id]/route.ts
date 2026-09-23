import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const existing = await prisma.knowledgeArticle.findFirst({
      where: { id, workspaceId: session.workspaceId },
    });
    if (!existing) return jsonError("Статья не найдена", 404);
    const parsed = z
      .object({
        title: z.string().min(2).optional(),
        body: z.string().min(2).optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const article = await prisma.knowledgeArticle.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ article });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const existing = await prisma.knowledgeArticle.findFirst({
      where: { id, workspaceId: session.workspaceId },
    });
    if (!existing) return jsonError("Статья не найдена", 404);
    await prisma.knowledgeArticle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
