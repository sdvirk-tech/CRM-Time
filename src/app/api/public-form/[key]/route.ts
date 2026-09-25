import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { publicUrl } from "@/lib/env";
import { widgetBrand } from "@/lib/widget-brand";
import { resolveConsentText } from "@/lib/consent";
import { embedOriginAllowed } from "@/lib/embed-origin";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_form") return jsonError("Форма не найдена", 404);
  const cfg = (channel.config ?? {}) as { allowedOrigins?: string[] };
  const chat = await prisma.channel.findFirst({
    where: { workspaceId: channel.workspaceId, type: "web_chat", enabled: true },
  });
  const ws = await prisma.workspace.findUnique({ where: { id: channel.workspaceId } });
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!embedOriginAllowed(ws?.embedAllowedOrigins, cfg.allowedOrigins, origin, referer)) {
    return jsonError("Виджет недоступен с этого домена", 403);
  }
  return NextResponse.json({
    name: channel.name,
    chatUrl: chat ? `${publicUrl()}/c/${chat.publicKey}` : null,
    fields: [],
    branding: widgetBrand(ws?.name || channel.name),
    consentText: resolveConsentText(ws?.consentText),
  });
}
