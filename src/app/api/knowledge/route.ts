import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  return withSession(async (session) => {
    const articles = await prisma.knowledgeArticle.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ articles, role: session.role });
  });
}

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({
        title: z.string().min(2),
        body: z.string().min(2),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужны заголовок и текст");
    const article = await prisma.knowledgeArticle.create({
      data: { workspaceId: session.workspaceId, title: parsed.data.title, body: parsed.data.body },
    });
    return NextResponse.json({ article });
  });
}
