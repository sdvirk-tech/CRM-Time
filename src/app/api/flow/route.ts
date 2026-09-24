import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { asConfig, ensureWorkspaceFlow } from "@/lib/workspace";
import { deepAnalysisEnabled, listModels } from "@/lib/ai";
import { decryptSecret } from "@/lib/crypto";
import { publicUrl } from "@/lib/env";

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
      return {
        id: c.id,
        type: c.type,
        name: c.name,
        publicKey: c.publicKey,
        hasToken,
        enabled: c.enabled,
        allowedOrigins: cfg.allowedOrigins ?? [],
        snippet:
          c.type === "web_chat"
            ? chatSnippet(c.publicKey)
            : c.type === "web_form"
              ? formSnippet(c.publicKey)
              : "",
        formUrl: `${publicUrl()}/f/${c.publicKey}`,
        chatUrl: `${publicUrl()}/c/${c.publicKey}`,
        webhookUrl: `${publicUrl()}/api/ingest/telegram/${c.publicKey}`,
        topicId: c.topicId,
        tokenPreview: isOwner && c.secretsEnc ? "••••••••" : null,
      };
    });
    return NextResponse.json({
      flow: { id: flow.id, name: flow.name },
      blocks: blocks.map((b) => ({
        ...b,
        config: asConfig(b.config),
      })),
      channels: channelPayload,
      processes,
      models: listModels(),
      deepAnalysisEnabled: deepAnalysisEnabled(),
      role: session.role,
      defaultModel: (await prisma.workspace.findUnique({ where: { id: session.workspaceId } }))?.defaultModel ?? null,
      greeting: (await prisma.workspace.findUnique({ where: { id: session.workspaceId } }))?.greeting ?? "",
      publicUrl: publicUrl(),
      slaMinutes: (await prisma.workspace.findUnique({ where: { id: session.workspaceId } }))?.slaMinutes ?? 15,
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

function formSnippet(key: string) {
  const url = `${publicUrl()}/api/ingest/web-form/${key}`;
  return `<!-- CRM-Time widget -->
<form action="${url}" method="POST" style="font-family:Calibri,Carlito,'Segoe UI',sans-serif;background:#F2F2F2;color:#1a1a1a;padding:16px;max-width:420px;border:1px solid #99CCFF">
  <div style="background:#C5E2FF;color:#1a1a1a;padding:8px 12px;margin:-16px -16px 12px">Оставить заявку</div>
  <input name="name" placeholder="Имя" required style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <input name="phone" placeholder="Телефон" required style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <input name="tnved" placeholder="ТН ВЭД" style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <input name="incoterms" placeholder="Incoterms" style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a">
  <textarea name="comment" placeholder="Комментарий" style="display:block;width:100%;margin:8px 0;padding:8px;border:1px solid #99CCFF;background:#F2F2F2;color:#1a1a1a"></textarea>
  <button type="submit" style="background:#99CCFF;color:#1a1a1a;border:0;padding:10px 16px;font-family:inherit">Отправить</button>
</form>`;
}
