import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { asConfig, buildFlowPreview, ensureWorkspaceFlow } from "@/lib/workspace";
import { deepAnalysisEnabled, listModels } from "@/lib/ai";
import { decryptSecret } from "@/lib/crypto";
import { publicUrl } from "@/lib/env";
import { asPollConfig } from "@/lib/telegram-ingest";
import { httpsWebhookAvailable } from "@/lib/telegram-poll";

export async function GET() {
  return withSession(async (session) => {
    const flow = await ensureWorkspaceFlow(session.workspaceId);
    const blocks = await prisma.flowBlock.findMany({
      where: { flowId: flow.id },
      orderBy: { position: "asc" },
    });
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
              : "",
        formUrl: `${publicUrl()}/f/${c.publicKey}`,
        chatUrl: `${publicUrl()}/c/${c.publicKey}`,
        webhookUrl: `${publicUrl()}/api/ingest/telegram/${c.publicKey}`,
        tokenPreview: c.secretsEnc ? "••••••••" : null,
        pollMode: Boolean(asPollConfig(c.config).pollMode) || (!httpsWebhookAvailable() && hasToken),
        pollOffset: asPollConfig(c.config).pollOffset ?? 0,
      };
    });
    const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    return NextResponse.json({
      flow: { id: flow.id, name: flow.name },
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
