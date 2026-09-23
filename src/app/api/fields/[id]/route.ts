import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const parsed = z
      .object({
        name: z.string().optional(),
        required: z.boolean().optional(),
        fieldType: z.enum(["text", "phone", "tnved", "incoterms", "number", "container"]).optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const field = await prisma.customField.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ field });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    await prisma.customField.deleteMany({ where: { id, workspaceId: session.workspaceId } });
    return NextResponse.json({ ok: true });
  });
}
