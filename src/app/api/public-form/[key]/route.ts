import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { publicUrl } from "@/lib/env";
import { widgetBrand } from "@/lib/widget-brand";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_form") return jsonError("Форма не найдена", 404);
  const chat = await prisma.channel.findFirst({
    where: { workspaceId: channel.workspaceId, type: "web_chat", enabled: true },
  });
  const ws = await prisma.workspace.findUnique({ where: { id: channel.workspaceId } });
  return NextResponse.json({
    name: channel.name,
    chatUrl: chat ? `${publicUrl()}/c/${chat.publicKey}` : null,
    fields: [],
    branding: widgetBrand(ws?.name || channel.name),
  });
}
