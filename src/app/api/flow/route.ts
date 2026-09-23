import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { asConfig, ensureWorkspaceFlow } from "@/lib/workspace";
import { deepAnalysisEnabled, listModels } from "@/lib/ai";
import { decryptSecret } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

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
        allowedOrigins: cfg.allowedOrigins ?? [],
        snippet: formSnippet(c.publicKey),
        formUrl: `${appUrl()}/f/${c.publicKey}`,
        webhookUrl: `${appUrl()}/api/ingest/telegram/${c.publicKey}`,
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
    });
  });
}

function formSnippet(key: string) {
  const url = `${appUrl()}/api/ingest/web-form/${key}`;
  return `<form action="${url}" method="POST">
  <input name="name" placeholder="Имя" required>
  <input name="phone" placeholder="Телефон" required>
  <input name="tnved" placeholder="ТН ВЭД">
  <input name="incoterms" placeholder="Incoterms">
  <textarea name="comment" placeholder="Комментарий"></textarea>
  <button type="submit">Отправить</button>
</form>`;
}
