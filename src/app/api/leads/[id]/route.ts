import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const lead = await prisma.lead.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: {
        contact: { include: { channels: true, fieldValues: { include: { field: true } } } },
        assignee: true,
        conversation: true,
        fieldValues: { include: { field: true } },
      },
    });
    if (!lead) return jsonError("Лид не найден", 404);
    return NextResponse.json(lead);
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const parsed = z
      .object({
        status: z.enum(["new", "in_progress", "qualified", "rejected"]).optional(),
        comment: z.string().optional(),
        urgent: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const lead = await prisma.lead.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json(lead);
  });
}
