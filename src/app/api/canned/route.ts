import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  return withSession(async (session) => {
    const items = await prisma.cannedReply.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { title: "asc" },
    });
    return NextResponse.json({ items });
  });
}

export async function POST(req: Request) {
  return withSession(async (session) => {
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(80),
        body: z.string().trim().min(1).max(4000),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужны название и текст");
    const item = await prisma.cannedReply.create({
      data: {
        workspaceId: session.workspaceId,
        title: parsed.data.title,
        body: parsed.data.body,
      },
    });
    return NextResponse.json({ item });
  });
}
