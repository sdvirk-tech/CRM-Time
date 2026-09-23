import { prisma } from "@/lib/prisma";
import { hashPassword, jsonError, verifyPassword } from "@/lib/auth";
import { withSession } from "@/lib/api";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(req: Request) {
  return withSession(async (session) => {
    const parsed = z
      .object({
        current: z.string().min(1),
        next: z.string().min(8),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Новый пароль — от 8 символов, плюс текущий");
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) {
      return jsonError("Неверный текущий пароль", 401);
    }
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword(parsed.data.next) },
    });
    return NextResponse.json({ ok: true });
  });
}
