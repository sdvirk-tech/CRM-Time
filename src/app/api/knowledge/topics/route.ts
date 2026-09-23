import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({ name: z.string().min(2) })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужно имя папки");
    const topic = await prisma.knowledgeTopic.create({
      data: { workspaceId: session.workspaceId, name: parsed.data.name },
    });
    return NextResponse.json({ topic });
  });
}
