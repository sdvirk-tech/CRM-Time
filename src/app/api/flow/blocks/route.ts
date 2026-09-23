import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { asConfig, ensureWorkspaceFlow, publicKey } from "@/lib/workspace";
import { z } from "zod";

const schema = z.object({
  kind: z.enum([
    "channel_web_form",
    "channel_telegram",
    "ai_parse",
    "ai_draft",
    "ai_deep",
    "action_create_lead",
    "action_show_draft",
  ]),
});

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonError("Неизвестный слот");
    const flow = await ensureWorkspaceFlow(session.workspaceId);
    const last = await prisma.flowBlock.aggregate({
      where: { flowId: flow.id },
      _max: { position: true },
    });
    const position = (last._max.position ?? -1) + 1;
    const ws = session.workspaceId;

    if (parsed.data.kind === "channel_web_form" || parsed.data.kind === "channel_telegram") {
      const type = parsed.data.kind === "channel_web_form" ? "web_form" : "telegram";
      const channel = await prisma.channel.create({
        data: {
          workspaceId: ws,
          type,
          name: type === "web_form" ? "Форма сайта" : "Telegram",
          publicKey: publicKey(),
          config: { allowedOrigins: [] },
        },
      });
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
            : "deep_analysis";
      const names = {
        parse_inbound: "Разобрать входящее",
        draft_reply: "Черновик ответа",
        deep_analysis: "Глубокий анализ",
      } as const;
      const proc = await prisma.aiProcess.create({
        data: {
          workspaceId: ws,
          type: processType,
          name: names[processType],
          prompt: "",
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
