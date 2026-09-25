import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { ingestInbound } from "@/lib/pipeline";
import { normalizePhone, validateField } from "@/lib/validators";
import { acceptedConsent, CONSENT_ERROR, contactHasConsent } from "@/lib/consent";
import {
  checkIngestRateLimit,
  ingestRateLimitedResponse,
  workspaceIngestLimits,
} from "@/lib/ingest-rate-limit";
import { embedOriginAllowed } from "@/lib/embed-origin";

type Ctx = { params: Promise<{ key: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_form") return jsonError("Форма не найдена", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);

  const limits = await workspaceIngestLimits(channel.workspaceId);
  const rl = checkIngestRateLimit({
    req,
    publicKey: key,
    maxPerMinute: limits.maxPerMinute,
    scope: limits.scope,
  });
  if (!rl.ok) return ingestRateLimitedResponse(rl.retryAfterSec);

  const cfg = (channel.config ?? {}) as { allowedOrigins?: string[] };
  const ws = await prisma.workspace.findUnique({ where: { id: channel.workspaceId } });
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!embedOriginAllowed(ws?.embedAllowedOrigins, cfg.allowedOrigins, origin, referer)) {
    return jsonError("Домен не в списке разрешённых", 403);
  }

  const contentType = req.headers.get("content-type") || "";
  let payload: Record<string, string> = {};
  if (contentType.includes("application/json")) {
    payload = (await req.json().catch(() => ({}))) as Record<string, string>;
  } else {
    const form = await req.formData();
    form.forEach((v, k) => {
      if (typeof v === "string") payload[k] = v;
    });
  }

  const name = String(payload.name || payload.имя || "").trim();
  const phoneRaw = String(payload.phone || payload.телефон || "").trim();
  const comment = String(payload.comment || payload.message || payload.комментарий || "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return jsonError("Некорректный телефон", 400, { field: "phone" });

  const custom = await prisma.customField.findMany({ where: { workspaceId: channel.workspaceId } });
  const fields: Record<string, string> = {};
  // Короткая форма: имя и телефон. Лишние ключи (ТН ВЭД и др.) — валидатор; брак не создаёт лид.
  for (const field of custom) {
    const value = String(payload[field.key] ?? "").trim();
    if (!value) continue;
    const err = validateField(field.fieldType, value, false);
    if (err) return jsonError(err, 400, { field: field.key });
    fields[field.key] = value;
  }

  const bodyParts = [
    name && `Имя: ${name}`,
    phone && `Телефон: ${phone}`,
    comment && `Комментарий: ${comment}`,
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);

  const forceDuplicate =
    payload.forceDuplicate === "true" ||
    payload.forceDuplicate === "1" ||
    payload.forceDuplicate === "yes" ||
    payload.forceDuplicate === "on";

  const consented = acceptedConsent(payload.consent);
  const had = await contactHasConsent({
    workspaceId: channel.workspaceId,
    source: "web_form",
    externalId: phone || "",
    phone,
  });
  if (!consented && !had) return jsonError(CONSENT_ERROR, 400);

  const result = await ingestInbound({
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    source: "web_form",
    externalId: phone || `form:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    name: name || undefined,
    phone: phone || undefined,
    body: bodyParts.join("\n") || "Заявка с формы",
    fields,
    consentAt: consented ? new Date() : undefined,
    forceDuplicate,
  });

  if ("duplicateWarning" in result && result.duplicateWarning) {
    return NextResponse.json(
      {
        ok: false,
        duplicateWarning: true,
        duplicateLeads: result.duplicateLeads,
        message: "У этого телефона уже есть открытый лид. Повторите с forceDuplicate для второго.",
      },
      { status: 409, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }

  if (contentType.includes("application/json")) {
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
  return new NextResponse("Заявка принята. Спасибо!", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
