import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { parseSavedQuery } from "@/lib/saved-views";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const screen = new URL(req.url).searchParams.get("screen");
    if (!screen) return jsonError("Укажите screen", 400);
    const items = await prisma.savedView.findMany({
      where: { workspaceId: session.workspaceId, screen },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      items: items.map((v) => ({
        id: v.id,
        screen: v.screen,
        name: v.name,
        query: v.queryJson,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withSession(async (session) => {
    const body = await req.json().catch(() => null);
    const parsed = z
      .object({
        screen: z.enum(["inbox", "leads"]),
        name: z.string().min(1).max(80),
        query: z.record(z.unknown()),
      })
      .safeParse(body);
    if (!parsed.success) return jsonError("Некорректные данные");
    let query: unknown;
    try {
      query = parseSavedQuery(parsed.data.screen, parsed.data.query);
    } catch {
      return jsonError("Некорректный фильтр");
    }
    const view = await prisma.savedView.upsert({
      where: {
        workspaceId_screen_name: {
          workspaceId: session.workspaceId,
          screen: parsed.data.screen,
          name: parsed.data.name.trim(),
        },
      },
      create: {
        workspaceId: session.workspaceId,
        screen: parsed.data.screen,
        name: parsed.data.name.trim(),
        queryJson: query as object,
        createdById: session.userId,
      },
      update: {
        queryJson: query as object,
      },
    });
    return NextResponse.json({ id: view.id, name: view.name, query: view.queryJson });
  });
}

export async function DELETE(req: Request) {
  return withSession(async (session) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonError("Укажите id", 400);
    await prisma.savedView.deleteMany({ where: { id, workspaceId: session.workspaceId } });
    return NextResponse.json({ ok: true });
  });
}
