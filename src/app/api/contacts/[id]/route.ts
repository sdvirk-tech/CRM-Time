import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { normalizePhone } from "@/lib/validators";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const contact = await prisma.contact.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: {
        channels: true,
        conversations: { include: { channel: true, messages: { orderBy: { createdAt: "desc" }, take: 20 } } },
        leads: true,
        fieldValues: { include: { field: true } },
      },
    });
    if (!contact) return jsonError("Контакт не найден", 404);
    return NextResponse.json(contact);
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const parsed = z
      .object({
        name: z.string().optional(),
        phone: z.string().nullable().optional(),
        comment: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const data = { ...parsed.data };
    if (data.phone) {
      const phone = normalizePhone(data.phone);
      if (!phone) return jsonError("Некорректный телефон", 400);
      data.phone = phone;
    }
    const contact = await prisma.contact.update({
      where: { id },
      data,
    });
    return NextResponse.json(contact);
  });
}
