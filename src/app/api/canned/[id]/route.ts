import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const existing = await prisma.cannedReply.findFirst({ where: { id, workspaceId: session.workspaceId } });
    if (!existing) return jsonError("Шаблон не найден", 404);
    await prisma.cannedReply.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
