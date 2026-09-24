import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { asConfig, buildFlowPreview, getWorkspaceFlow, listWorkspaceFlows } from "@/lib/workspace";
import { deepAnalysisEnabled, listModels } from "@/lib/ai";
import { decryptSecret } from "@/lib/crypto";
import { publicUrl } from "@/lib/env";
import { asPollConfig } from "@/lib/telegram-ingest";
import { httpsWebhookAvailable } from "@/lib/telegram-poll";
import { parseEmailSecrets } from "@/lib/email";
import { z } from "zod";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const flowId = new URL(req.url).searchParams.get("flowId");
    const all = await listWorkspaceFlows(session.workspaceId);
    const flow = await getWorkspaceFlow(session.workspaceId, flowId);
    const blocks = flow.blocks;
    const channels = await prisma.channel.findMany({ where: { workspaceId: session.workspaceId } });
    const processes = await prisma.aiProcess.findMany({
      where: { workspaceId: session.workspaceId },
      include: { binding: true },
    });
    const isOwner = session.role === "owner";
    const blockPayload = blocks.map((b) => ({
      ...b,
      config: asConfig(b.config),
    }));
    const { preview, compact } = buildFlowPreview(blockPayload, processes);
    const chatKey = channels.find((c) => c.type === "web_chat")?.publicKey;
    const channelPayload = channels.map((c) => {
      const cfg = (c.config ?? {}) as { allowedOrigins?: string[] };
      let hasToken = false;
      if (c.secretsEnc) {
        try {
          hasToken = Boolean(decryptSecret(c.secretsEnc));
        } catch {
          hasToken = true;
        }
      }
      const emailSecrets = c.type === "email" && isOwner ? parseEmailSecrets(c.secretsEnc) : {};
      const fromAddress = emailSecrets.fromAddress || "";
      const base = {
        id: c.id,
        type: c.type,
        name: c.name,
        hasToken,
        enabled: c.enabled,
        topicId: c.topicId,
      };
      if (!isOwner) {
        return { ...base, allowedOrigins: [] as string[] };
      }
      return {
        ...base,
        publicKey: c.publicKey,
        allowedOrigins: cfg.allowedOrigins ?? [],
        snippet:
          c.type === "web_chat"
            ? chatSnippet(c.publicKey)
            : c.type === "web_form"
              ? formSnippet(c.publicKey, chatKey)
              : c.type === "email"
                ? emailSnippet(c.publicKey, fromAddress)
                : "",
        formUrl: `${publicUrl()}/f/${c.publicKey}`,
        chatUrl: `${publicUrl()}/c/${c.publicKey}`,
        webhookUrl:
          c.type === "email"
            ? `${publicUrl()}/api/ingest/email/${c.publicKey}`
            : `${publicUrl()}/api/ingest/telegram/${c.publicKey}`,
        ingestUrl: c.type === "email" ? `${publicUrl()}/api/ingest/email/${c.publicKey}` : undefined,
        mailto: fromAddress ? `mailto:${fromAddress}` : undefined,
        fromAddress: fromAddress || undefined,
        smtpHost: emailSecrets.smtpHost || undefined,
        smtpPort: emailSecrets.smtpPort || undefined,
        smtpUser: emailSecrets.smtpUser || undefined,
        tokenPreview: c.secretsEnc ? "••••••••" : null,
        pollMode: Boolean(asPollConfig(c.config).pollMode) || (!httpsWebhookAvailable() && hasToken && c.type === "telegram"),
        pollOffset: asPollConfig(c.config).pollOffset ?? 0,
      };
    });
    const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    const flows = all.map((f) => {
      const { preview: p, compact: c } = buildFlowPreview(
        f.blocks.map((b) => ({ ...b, config: asConfig(b.config) })),
        processes,
      );
      return { id: f.id, name: f.name, published: f.published, preview: p, compact: c, blockCount: f.blocks.length };
    });
    return NextResponse.json({
      flow: { id: flow.id, name: flow.name, published: flow.published },
      flows,
      blocks: blockPayload,
      channels: channelPayload,
      processes,
      models: listModels(),
      deepAnalysisEnabled: deepAnalysisEnabled(),
      role: session.role,
      defaultModel: workspace?.defaultModel ?? null,
      greeting: workspace?.greeting ?? "",
      salesPrompt: workspace?.salesPrompt ?? "",
      routingMode: workspace?.routingMode ?? "pool",
      publicUrl: isOwner ? publicUrl() : null,
      slaMinutes: workspace?.slaMinutes ?? 15,
      httpsWebhook: httpsWebhookAvailable(),
      preview,
      compact,
      topics: await prisma.knowledgeTopic.findMany({
        where: { workspaceId: session.workspaceId },
        orderBy: { createdAt: "asc" },
      }),
    });
  });
}

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({ name: z.string().min(1).max(80).optional() })
      .safeParse(await req.json().catch(() => ({})));
    const count = await prisma.flow.count({ where: { workspaceId: session.workspaceId } });
    const name = parsed.success && parsed.data.name ? parsed.data.name : `Цепочка ${count + 1}`;
    const flow = await prisma.flow.create({
      data: { workspaceId: session.workspaceId, name, published: true },
    });
    return NextResponse.json({ flow: { id: flow.id, name: flow.name, published: flow.published } });
  });
}

export async function PATCH(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(80).optional(),
        published: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен id цепочки");
    const existing = await prisma.flow.findFirst({
      where: { id: parsed.data.id, workspaceId: session.workspaceId },
    });
    if (!existing) return jsonError("Цепочка не найдена", 404);
    const flow = await prisma.flow.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.published !== undefined ? { published: parsed.data.published } : {}),
      },
    });
    return NextResponse.json({ flow: { id: flow.id, name: flow.name, published: flow.published } });
  });
}

export async function DELETE(req: Request) {
  return withOwner(async (session) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonError("Нужен id");
    const count = await prisma.flow.count({ where: { workspaceId: session.workspaceId } });
    if (count <= 1) return jsonError("Нельзя убрать последнюю цепочку");
    const existing = await prisma.flow.findFirst({ where: { id, workspaceId: session.workspaceId } });
    if (!existing) return jsonError("Цепочка не найдена", 404);
    await prisma.flow.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}

function chatSnippet(key: string) {
  const url = `${publicUrl()}/c/${key}`;
  return `<!-- CRM-Time chat -->
<iframe src="${url}" title="Чат" style="font-family:Calibri,Carlito,'Segoe UI',sans-serif;background:#F2F2F2;color:#1a1a1a;border:1px solid #99CCFF;width:360px;height:480px"></iframe>`;
}

function formSnippet(key: string, chatKey?: string) {
  const url = `${publicUrl()}/api/ingest/web-form/${key}`;
  const chat = chatKey ? `${publicUrl()}/c/${chatKey}` : `${publicUrl()}/f/${key}`;
  return `<!-- CRM-Time: имя и телефон, груз в чате -->
<form action="${url}" method="POST" style="font-family:Calibri,Carlito,'Segoe UI',sans-serif;background:#F2F2F2;color:#1a1a1a;padding:16px;max-width:420px;border:1px solid #99CCFF">
  <div style="background:#C5E2FF;color:#1a1a1a;padding:8px 12px;margin:-16px -16px 12px">Имя и телефон</div>
  <input name="name" placeholder="Имя" required style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <input name="phone" placeholder="Телефон" required style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <button type="submit" style="background:#99CCFF;color:#1a1a1a;border:0;padding:10px 16px;font-family:inherit">Оставить контакт</button>
  <p style="margin:12px 0 0;font-size:13px"><a href="${chat}" style="color:#1a1a1a">Написать в чат</a></p>
</form>`;
}

function emailSnippet(key: string, fromAddress: string) {
  const url = `${publicUrl()}/api/ingest/email/${key}`;
  const mail = fromAddress || "inbox@example.com";
  return `<!-- CRM-Time: почта как канал. Form-to-mailbox POST JSON {from,subject,text} -->
<form action="${url}" method="POST" style="font-family:Calibri,Carlito,'Segoe UI',sans-serif;background:#F2F2F2;color:#1a1a1a;padding:16px;max-width:420px;border:1px solid #99CCFF">
  <div style="background:#C5E2FF;color:#1a1a1a;padding:8px 12px;margin:-16px -16px 12px">Написать на почту</div>
  <input name="from" type="email" placeholder="Ваша почта" required style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <input name="name" placeholder="Имя" style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <input name="subject" placeholder="Тема" style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <textarea name="text" placeholder="Сообщение" required rows="4" style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a"></textarea>
  <button type="submit" style="background:#99CCFF;color:#1a1a1a;border:0;padding:10px 16px;font-family:inherit">Отправить</button>
  <p style="margin:12px 0 0;font-size:13px"><a href="mailto:${mail}" style="color:#1a1a1a">Или mailto:${mail}</a></p>
</form>`;
}
