import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  return withSession(async (session) => {
    const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    if (!workspace) return jsonError("Нет воркспейса", 404);
    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      tradeDescription: workspace.tradeDescription,
      defaultModel: workspace.defaultModel,
      greeting: workspace.greeting,
    });
  });
}

export async function PATCH(req: Request) {
  return withOwner(async (session) => {
    const body = await req.json().catch(() => null);
    const parsed = z
      .object({
        name: z.string().min(2).optional(),
        tradeDescription: z.string().optional(),
        defaultModel: z.string().nullable().optional(),
        greeting: z.string().max(2000).optional(),
      })
      .safeParse(body);
    if (!parsed.success) return jsonError("Некорректные данные");
    const workspace = await prisma.workspace.update({
      where: { id: session.workspaceId },
      data: parsed.data,
    });
    return NextResponse.json(workspace);
  });
}
