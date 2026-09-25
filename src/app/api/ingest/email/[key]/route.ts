import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { ingestInbound } from "@/lib/pipeline";
import { corsJson, corsOptions } from "@/lib/cors";
import {
  checkIngestRateLimit,
  ingestRateLimitedResponse,
  workspaceIngestLimits,
} from "@/lib/ingest-rate-limit";

type Ctx = { params: Promise<{ key: string }> };

export async function OPTIONS() {
  return corsOptions();
}

function pick(payload: Record<string, unknown>, keys: string[]) {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "email") return jsonError("Почтовый канал не найден", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);

  const limits = await workspaceIngestLimits(channel.workspaceId);
  const rl = checkIngestRateLimit({
    req,
    publicKey: key,
    maxPerMinute: limits.maxPerMinute,
    scope: limits.scope,
  });
  if (!rl.ok) return ingestRateLimitedResponse(rl.retryAfterSec);

  const contentType = req.headers.get("content-type") || "";
  let payload: Record<string, unknown> = {};
  if (contentType.includes("application/json")) {
    payload = ((await req.json().catch(() => ({}))) as Record<string, unknown>) || {};
  } else {
    const form = await req.formData().catch(() => null);
    if (form) {
      form.forEach((v, k) => {
        if (typeof v === "string") payload[k] = v;
      });
    }
  }

  const from = pick(payload, ["from", "sender", "email", "envelope_from", "From"]);
  const name = pick(payload, ["name", "from_name", "имя"]) || from.split("@")[0] || "Почта";
  const subject = pick(payload, ["subject", "тема", "Subject"]);
  const text = pick(payload, ["text", "body", "plain", "stripped-text", "html", "message", "комментарий"]);
  if (!from || !text) return jsonError("Нужны from и text", 400);

  const body = [subject && `Тема: ${subject}`, `От: ${from}`, text].filter(Boolean).join("\n");
  const result = await ingestInbound({
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    source: "email",
    externalId: from.toLowerCase(),
    username: from,
    name,
    body,
    eventKey: pick(payload, ["message_id", "Message-Id", "eventKey"]) || undefined,
  });
  return corsJson({ ok: true, ...result });
}
