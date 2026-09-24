import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { z } from "zod";

export async function GET() {
  return withSession(async (session) => {
    const items = await prisma.tag.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ items });
  });
}

export async function POST(req: Request) {
  return withSession(async (session) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(40) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужно имя метки");
    const name = parsed.data.name;
    const existing = await prisma.tag.findFirst({
      where: { workspaceId: session.workspaceId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) return NextResponse.json({ tag: existing, created: false });
    const tag = await prisma.tag.create({ data: { workspaceId: session.workspaceId, name } });
    await logActivity({
      workspaceId: session.workspaceId,
      actor: session.name,
      event: "tag",
      message: `Метка «${name}»`,
    });
    return NextResponse.json({ tag, created: true });
  });
}
