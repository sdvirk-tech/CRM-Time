import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { ingestInbound } from "@/lib/pipeline";
import { corsJson, corsOptions } from "@/lib/cors";
import { photoNoteFromUrl, saveChatPhoto } from "@/lib/uploads";
import { acceptedConsent, CONSENT_ERROR, contactHasConsent } from "@/lib/consent";
import { widgetBrand } from "@/lib/widget-brand";
import {
  checkIngestRateLimit,
  ingestRateLimitedResponse,
  workspaceIngestLimits,
} from "@/lib/ingest-rate-limit";

type Ctx = { params: Promise<{ key: string }> };

export async function OPTIONS() {
  return corsOptions();
}

export async function GET(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_chat") return jsonError("Чат не найден", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);
  const ws = await prisma.workspace.findUnique({ where: { id: channel.workspaceId } });
  const branding = widgetBrand(ws?.name || channel.name);
  const sessionId = new URL(req.url).searchParams.get("sessionId") || "";
  if (!sessionId) return corsJson({ messages: [], branding });
  const contactCh = await prisma.contactChannel.findUnique({
    where: {
      workspaceId_type_externalId: {
        workspaceId: channel.workspaceId,
        type: "web_chat",
        externalId: sessionId,
      },
    },
  });
  if (!contactCh) return corsJson({ messages: [], needsConsent: true, branding });
  const contact = await prisma.contact.findUnique({ where: { id: contactCh.contactId } });
  const conv = await prisma.conversation.findFirst({
    where: { workspaceId: channel.workspaceId, contactId: contactCh.contactId, channelId: channel.id },
  });
  if (!conv) return corsJson({ messages: [], needsConsent: !contact?.consentAt, branding });
  const messages = await prisma.message.findMany({
    where: { conversationId: conv.id, direction: { in: ["inbound", "outbound"] } },
    orderBy: { createdAt: "asc" },
  });
  return corsJson({
    conversationId: conv.id,
    needsConsent: !contact?.consentAt,
    branding,
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt,
    })),
  });
}

async function readPayload(req: Request): Promise<{
  sessionId: string;
  text: string;
  name?: string;
  photoNote: string;
  consent: unknown;
}> {
  const ctype = req.headers.get("content-type") || "";
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const sessionId = String(form.get("sessionId") || "").trim();
    const text = String(form.get("text") || "").trim();
    const name = String(form.get("name") || "").trim() || undefined;
    const consent = form.get("consent");
    let photoNote = "";
    const photoUrl = String(form.get("photoUrl") || form.get("photoFileId") || "").trim();
    if (photoUrl) photoNote = photoNoteFromUrl(photoUrl.startsWith("file_id:") || photoUrl.startsWith("http") || photoUrl.startsWith("/") ? photoUrl : `file_id:${photoUrl}`);
    const file = form.get("photo");
    if (file && typeof file !== "string" && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      const url = await saveChatPhoto(buf, file.type || "image/jpeg");
      photoNote = photoNoteFromUrl(url);
    }
    return { sessionId, text, name, photoNote, consent };
  }
  const body = (await req.json().catch(() => null)) as {
    sessionId?: string;
    text?: string;
    name?: string;
    photoUrl?: string;
    photoFileId?: string;
    consent?: unknown;
  } | null;
  const sessionId = String(body?.sessionId || "").trim();
  const text = String(body?.text || "").trim();
  const name = body?.name?.trim() || undefined;
  let photoNote = "";
  if (body?.photoUrl) photoNote = photoNoteFromUrl(body.photoUrl);
  else if (body?.photoFileId) photoNote = photoNoteFromUrl(`file_id:${body.photoFileId}`);
  return { sessionId, text, name, photoNote, consent: body?.consent };
}

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_chat") return jsonError("Чат не найден", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);

  const limits = await workspaceIngestLimits(channel.workspaceId);
  const rl = checkIngestRateLimit({
    req,
    publicKey: key,
    maxPerMinute: limits.maxPerMinute,
    scope: limits.scope,
  });
  if (!rl.ok) return ingestRateLimitedResponse(rl.retryAfterSec);

  let payload: Awaited<ReturnType<typeof readPayload>>;
  try {
    payload = await readPayload(req);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Не удалось принять фото", 400);
  }
  const { sessionId, text, name, photoNote, consent } = payload;
  if (!sessionId || (!text && !photoNote)) return jsonError("Нужны sessionId и текст или фото");
  const consented = acceptedConsent(consent);
  const had = await contactHasConsent({
    workspaceId: channel.workspaceId,
    source: "web_chat",
    externalId: sessionId,
  });
  if (!consented && !had) return jsonError(CONSENT_ERROR, 400);
  const result = await ingestInbound({
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    source: "web_chat",
    externalId: sessionId,
    name: name || "Гость сайта",
    body: text || photoNote,
    photoNote,
    consentAt: consented ? new Date() : undefined,
  });
  return corsJson({ ok: true, ...result });
}
