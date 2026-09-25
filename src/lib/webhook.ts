import { prisma } from "./prisma";
import { decryptSecret } from "./crypto";
import { logActivity } from "./activity";

function allowedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
    return false;
  } catch {
    return false;
  }
}

async function trimWebhookLog(workspaceId: string) {
  const keep = await prisma.webhookDelivery.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true },
  });
  const ids = keep.map((k) => k.id);
  if (ids.length === 0) return;
  await prisma.webhookDelivery.deleteMany({
    where: { workspaceId, id: { notIn: ids } },
  });
}

type LeadWebhookPayload = {
  event: "lead.new";
  leadId: string;
  status: string;
  source: string;
  contact: { id: string; name: string; phone: string | null };
  createdAt: string;
};

async function postLeadWebhook(opts: {
  workspaceId: string;
  leadId: string;
  contactId: string;
  url: string;
  secret: string;
  payload: LeadWebhookPayload;
}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.secret) headers["X-CRM-Time-Secret"] = opts.secret;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  let statusCode: number | null = null;
  let err: string | null = null;
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.payload),
      signal: ac.signal,
    });
    statusCode = res.status;
    err = res.ok ? null : `HTTP ${res.status}`;
  } catch (e) {
    err = e instanceof Error ? e.message.slice(0, 180) : "ошибка";
  } finally {
    clearTimeout(t);
  }
  const delivery = await prisma.webhookDelivery.create({
    data: {
      workspaceId: opts.workspaceId,
      leadId: opts.leadId,
      url: opts.url,
      success: !err,
      statusCode,
      error: err,
      payload: opts.payload,
    },
  });
  await trimWebhookLog(opts.workspaceId);
  await prisma.workspace.update({
    where: { id: opts.workspaceId },
    data: { outboundWebhookLastAt: new Date(), outboundWebhookLastError: err },
  });
  await logActivity({
    workspaceId: opts.workspaceId,
    leadId: opts.leadId,
    contactId: opts.contactId,
    actor: "система",
    event: "webhook",
    message: err ? `Webhook лида Новый: ${err}` : `Webhook лида Новый → ${opts.url}`,
  });
  return delivery;
}

export async function notifyLeadWebhook(opts: {
  workspaceId: string;
  leadId: string;
  contactId: string;
  contactName: string;
  source: string;
  phone?: string | null;
}) {
  try {
    const ws = await prisma.workspace.findUnique({ where: { id: opts.workspaceId } });
    const url = (ws?.outboundWebhookUrl || "").trim();
    if (!url || !allowedUrl(url)) return;
    let secret = "";
    if (ws?.outboundWebhookSecretEnc) {
      try {
        secret = decryptSecret(ws.outboundWebhookSecretEnc);
      } catch {
        secret = "";
      }
    }
    const payload: LeadWebhookPayload = {
      event: "lead.new",
      leadId: opts.leadId,
      status: "new",
      source: opts.source,
      contact: { id: opts.contactId, name: opts.contactName, phone: opts.phone || null },
      createdAt: new Date().toISOString(),
    };
    await postLeadWebhook({
      workspaceId: opts.workspaceId,
      leadId: opts.leadId,
      contactId: opts.contactId,
      url,
      secret,
      payload,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 180) : "ошибка";
    await prisma.workspace
      .update({
        where: { id: opts.workspaceId },
        data: { outboundWebhookLastAt: new Date(), outboundWebhookLastError: message },
      })
      .catch(() => null);
  }
}

export async function retryWebhookDelivery(workspaceId: string, deliveryId: string) {
  const row = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, workspaceId },
  });
  if (!row) return { ok: false as const, error: "Запись не найдена" };
  if (row.success) return { ok: false as const, error: "Повтор только для неудачных" };
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const url = (ws?.outboundWebhookUrl || "").trim();
  if (!url || !allowedUrl(url)) return { ok: false as const, error: "URL webhook не настроен" };
  let secret = "";
  if (ws?.outboundWebhookSecretEnc) {
    try {
      secret = decryptSecret(ws.outboundWebhookSecretEnc);
    } catch {
      secret = "";
    }
  }
  const payload = row.payload as LeadWebhookPayload;
  const delivery = await postLeadWebhook({
    workspaceId,
    leadId: row.leadId,
    contactId: payload.contact?.id || "",
    url,
    secret,
    payload: { ...payload, createdAt: new Date().toISOString() },
  });
  return { ok: true as const, delivery };
}

export function webhookUrlOk(url: string) {
  return allowedUrl(url);
}
