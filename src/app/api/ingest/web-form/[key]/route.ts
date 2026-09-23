import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { ingestInbound } from "@/lib/pipeline";
import { normalizePhone, validateField } from "@/lib/validators";

type Ctx = { params: Promise<{ key: string }> };

function originAllowed(allowed: string[] | undefined, origin: string | null) {
  if (!allowed || allowed.length === 0) return true;
  if (!origin) return true;
  return allowed.some((d) => origin.includes(d.replace(/^https?:\/\//, "")));
}

export async function POST(req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_form") return jsonError("Форма не найдена", 404);
  if (channel.enabled === false) return jsonError("Канал выключен", 403);

  const cfg = (channel.config ?? {}) as { allowedOrigins?: string[] };
  const origin = req.headers.get("origin");
  if (!originAllowed(cfg.allowedOrigins, origin)) {
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
  const errors: Record<string, string> = {};
  for (const field of custom) {
    const value = String(payload[field.key] ?? "");
    const err = validateField(field.fieldType, value, field.required);
    if (err) errors[field.key] = err;
    else if (value.trim()) fields[field.key] = value.trim();
  }
  if (errors.tnved) {
    return NextResponse.json({ error: "Невалидный ТН ВЭД", errors }, { status: 400 });
  }
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Проверьте поля", errors }, { status: 400 });
  }

  const bodyParts = [
    name && `Имя: ${name}`,
    phone && `Телефон: ${phone}`,
    comment && `Комментарий: ${comment}`,
    ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);

  const result = await ingestInbound({
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    source: "web_form",
    externalId: phone || `form:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    name: name || undefined,
    phone: phone || undefined,
    body: bodyParts.join("\n") || "Заявка с формы",
    fields,
  });

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
