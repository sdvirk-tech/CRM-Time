import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { ingestInbound } from "@/lib/pipeline";
import { corsJson, corsOptions } from "@/lib/cors";

type Ctx = { params: Promise<{ key: string }> };

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_chat") return jsonError("Чат не найден", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);
  const sessionId = new URL(req.url).searchParams.get("sessionId") || "";
  if (!sessionId) return corsJson({ messages: [] });
  const contactCh = await prisma.contactChannel.findUnique({
    where: {
      workspaceId_type_externalId: {
        workspaceId: channel.workspaceId,
        type: "web_chat",
        externalId: sessionId,
      },
    },
  });
  if (!contactCh) return corsJson({ messages: [] });
  const conv = await prisma.conversation.findFirst({
    where: { workspaceId: channel.workspaceId, contactId: contactCh.contactId, channelId: channel.id },
  });
  if (!conv) return corsJson({ messages: [] });
  const messages = await prisma.message.findMany({
    where: { conversationId: conv.id, direction: { in: ["inbound", "outbound"] } },
    orderBy: { createdAt: "asc" },
  });
  return corsJson({
    conversationId: conv.id,
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_chat") return jsonError("Чат не найден", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);
  const body = (await req.json().catch(() => null)) as {
    sessionId?: string;
    text?: string;
    name?: string;
  } | null;
  const sessionId = String(body?.sessionId || "").trim();
  const text = String(body?.text || "").trim();
  if (!sessionId || !text) return jsonError("Нужны sessionId и text");
  const result = await ingestInbound({
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    source: "web_chat",
    externalId: sessionId,
    name: body?.name?.trim() || "Гость сайта",
    body: text,
  });
  return corsJson({ ok: true, ...result });
}
