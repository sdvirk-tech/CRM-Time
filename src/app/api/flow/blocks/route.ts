import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { asConfig, bindVedTopic, defaultProcessPrompt, getWorkspaceFlow, publicKey } from "@/lib/workspace";
import { z } from "zod";

const schema = z.object({
  kind: z.enum([
    "channel_web_form",
    "channel_telegram",
    "channel_web_chat",
    "channel_email",
    "ai_parse",
    "ai_draft",
    "ai_deep",
    "ai_ping",
    "action_create_lead",
    "action_show_draft",
  ]),
  flowId: z.string().optional(),
});

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonError("Неизвестный слот");
    const flow = await getWorkspaceFlow(session.workspaceId, parsed.data.flowId);
    const last = await prisma.flowBlock.aggregate({
      where: { flowId: flow.id },
      _max: { position: true },
    });
    const position = (last._max.position ?? -1) + 1;
    const ws = session.workspaceId;

    if (
      parsed.data.kind === "channel_web_form" ||
      parsed.data.kind === "channel_telegram" ||
      parsed.data.kind === "channel_web_chat" ||
      parsed.data.kind === "channel_email"
    ) {
      const type =
        parsed.data.kind === "channel_web_form"
          ? "web_form"
          : parsed.data.kind === "channel_web_chat"
            ? "web_chat"
            : parsed.data.kind === "channel_email"
              ? "email"
              : "telegram";
      const names = {
        web_form: "Форма сайта",
        web_chat: "Чат на сайте",
        telegram: "Telegram",
        email: "Почта",
      } as const;
      const channel = await prisma.channel.create({
        data: {
          workspaceId: ws,
          type,
          name: names[type],
          publicKey: publicKey(),
          config: { allowedOrigins: [] },
        },
      });
      if (type === "telegram" || type === "web_chat" || type === "email") {
        await bindVedTopic(ws, channel.id);
      }
      const block = await prisma.flowBlock.create({
        data: {
          workspaceId: ws,
          flowId: flow.id,
          type: "channel",
          position,
          label: channel.name,
          config: { channelId: channel.id, channelType: type },
        },
      });
      return NextResponse.json({ block: { ...block, config: asConfig(block.config) } });
    }

    if (parsed.data.kind.startsWith("ai_")) {
      const processType =
        parsed.data.kind === "ai_parse"
          ? "parse_inbound"
          : parsed.data.kind === "ai_draft"
            ? "draft_reply"
            : parsed.data.kind === "ai_ping"
              ? "client_ping"
              : "deep_analysis";
      const names = {
        parse_inbound: "Разобрать входящее",
        draft_reply: "Черновик ответа",
        deep_analysis: "Глубокий анализ",
        client_ping: "Пинг клиента",
      } as const;
      const proc = await prisma.aiProcess.create({
        data: {
          workspaceId: ws,
          type: processType,
          name: names[processType],
          prompt:
            processType === "draft_reply"
              ? (await prisma.workspace.findUnique({ where: { id: ws } }))?.salesPrompt?.trim() ||
                defaultProcessPrompt(processType)
              : defaultProcessPrompt(processType),
        },
      });
      const block = await prisma.flowBlock.create({
        data: {
          workspaceId: ws,
          flowId: flow.id,
          type: "ai_process",
          position,
          label: names[processType],
          config: { aiProcessId: proc.id, processType },
        },
      });
      return NextResponse.json({ block: { ...block, config: asConfig(block.config) } });
    }

    const actionType = parsed.data.kind === "action_create_lead" ? "create_lead" : "show_draft";
    const label = actionType === "create_lead" ? "Создать лид" : "Показать черновик";
    const block = await prisma.flowBlock.create({
      data: {
        workspaceId: ws,
        flowId: flow.id,
        type: "action",
        position,
        label,
        config: { actionType },
      },
    });
    return NextResponse.json({ block: { ...block, config: asConfig(block.config) } });
  });
}
