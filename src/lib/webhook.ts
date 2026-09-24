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
    const payload = {
      event: "lead.new",
      leadId: opts.leadId,
      status: "new",
      source: opts.source,
      contact: { id: opts.contactId, name: opts.contactName, phone: opts.phone || null },
      createdAt: new Date().toISOString(),
    };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["X-CRM-Time-Secret"] = secret;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ac.signal,
    }).finally(() => clearTimeout(t));
    const err = res.ok ? null : `HTTP ${res.status}`;
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
      message: err ? `Webhook лида Новый: ${err}` : `Webhook лида Новый → ${url}`,
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

export function webhookUrlOk(url: string) {
  return allowedUrl(url);
}