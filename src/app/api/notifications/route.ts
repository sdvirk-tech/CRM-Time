import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  return withSession(async (session) => {
    const items = await prisma.notification.findMany({
      where: { workspaceId: session.workspaceId, userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({
      unread: items.filter((n) => !n.readAt).length,
      items,
    });
  });
}

export async function PATCH(req: Request) {
  return withSession(async (session) => {
    const parsed = z
      .object({
        id: z.string().optional(),
        all: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const now = new Date();
    if (parsed.data.all) {
      await prisma.notification.updateMany({
        where: { workspaceId: session.workspaceId, userId: session.userId, readAt: null },
        data: { readAt: now },
      });
    } else if (parsed.data.id) {
      await prisma.notification.updateMany({
        where: { id: parsed.data.id, workspaceId: session.workspaceId, userId: session.userId },
        data: { readAt: now },
      });
    } else {
      return jsonError("Нужен id или all");
    }
    const unread = await prisma.notification.count({
      where: { workspaceId: session.workspaceId, userId: session.userId, readAt: null },
    });
    return NextResponse.json({ ok: true, unread });
  });
}
