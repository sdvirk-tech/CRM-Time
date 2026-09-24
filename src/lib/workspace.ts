import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { BAZA_ZNANIY, CARGO_FIELDS, PARSE_CARGO_PROMPT, PING_PROMPT, SALES_FIRST_REPLY, SALES_PROMPT } from "./sales";

export const VED_TEMPLATE = CARGO_FIELDS.map((f) => ({ ...f }));

export const VED_KNOWLEDGE = {
  title: "База знаний ВЭД (МАКС)",
  body: BAZA_ZNANIY,
};

export async function ensureWorkspaceFlow(workspaceId: string) {
  const existing = await prisma.flow.findFirst({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.flow.create({
    data: { workspaceId, name: "Основная цепочка", published: true },
  });
}

export async function listWorkspaceFlows(workspaceId: string) {
  await ensureWorkspaceFlow(workspaceId);
  return prisma.flow.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    include: { blocks: { orderBy: { position: "asc" } } },
  });
}

export async function getWorkspaceFlow(workspaceId: string, flowId?: string | null) {
  const flows = await listWorkspaceFlows(workspaceId);
  if (flowId) {
    const found = flows.find((f) => f.id === flowId);
    if (found) return found;
  }
  return flows[0];
}

export async function flowForChannel(workspaceId: string, channelId: string) {
  const blocks = await prisma.flowBlock.findMany({
    where: { workspaceId, type: "channel" },
    include: { flow: { include: { blocks: { orderBy: { position: "asc" } } } } },
  });
  const match = blocks.find((b) => asConfig(b.config).channelId === channelId);
  if (match?.flow) return match.flow;
  return getWorkspaceFlow(workspaceId);
}

export async function applyVedTemplate(workspaceId: string) {
  for (const f of CARGO_FIELDS) {
    await prisma.customField.upsert({
      where: { workspaceId_key: { workspaceId, key: f.key } },
      update: { name: f.name, fieldType: f.fieldType, required: f.required },
      create: { workspaceId, name: f.name, key: f.key, fieldType: f.fieldType, required: f.required },
    });
  }
  let topic = await prisma.knowledgeTopic.findFirst({
    where: { workspaceId, name: "ВЭД" },
  });
  if (!topic) {
    topic = await prisma.knowledgeTopic.create({
      data: { workspaceId, name: "ВЭД" },
    });
  }
  const existing = await prisma.knowledgeArticle.findFirst({
    where: { workspaceId, title: VED_KNOWLEDGE.title },
  });
  if (!existing) {
    await prisma.knowledgeArticle.create({
      data: { workspaceId, topicId: topic.id, title: VED_KNOWLEDGE.title, body: VED_KNOWLEDGE.body },
    });
  } else {
    await prisma.knowledgeArticle.update({
      where: { id: existing.id },
      data: { topicId: topic.id, body: VED_KNOWLEDGE.body, enabled: true },
    });
  }
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (ws && (!ws.greeting || ws.greeting.includes("Напишите задачу"))) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { greeting: SALES_FIRST_REPLY },
    });
  }
  if (ws && !ws.salesPrompt?.trim()) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { salesPrompt: SALES_PROMPT },
    });
  }
  await prisma.channel.updateMany({
    where: { workspaceId, type: { in: ["telegram", "web_chat", "email"] }, topicId: null },
    data: { topicId: topic.id },
  });
}

export async function bindVedTopic(workspaceId: string, channelId: string) {
  const topic = await prisma.knowledgeTopic.findFirst({ where: { workspaceId, name: "ВЭД" } });
  if (!topic) return;
  await prisma.channel.update({ where: { id: channelId }, data: { topicId: topic.id } });
}

export function defaultProcessPrompt(processType: string) {
  if (processType === "draft_reply") return SALES_PROMPT;
  if (processType === "parse_inbound") return PARSE_CARGO_PROMPT;
  if (processType === "client_ping") return PING_PROMPT;
  return "";
}

export function publicKey(): string {
  return randomBytes(12).toString("hex");
}

export function inviteToken(): string {
  return randomBytes(18).toString("hex");
}

export type BlockConfig = {
  channelId?: string;
  channelType?: "telegram" | "web_form" | "web_chat" | "email";
  aiProcessId?: string;
  processType?: "parse_inbound" | "draft_reply" | "deep_analysis" | "client_ping";
  actionType?: "create_lead" | "show_draft";
  allowedOrigins?: string[];
};

export function asConfig(raw: unknown): BlockConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as BlockConfig;
}

type PreviewBlock = { type: string; label: string; config: unknown };
type PreviewProcess = { id: string; binding: { provider: string; model: string } | null };

function compactName(block: PreviewBlock) {
  const cfg = asConfig(block.config);
  if (block.type === "channel") {
    if (cfg.channelType === "web_form") return "форма";
    if (cfg.channelType === "web_chat") return "чат";
    if (cfg.channelType === "telegram") return "telegram";
    if (cfg.channelType === "email") return "почта";
    return block.label.toLowerCase();
  }
  if (block.type === "ai_process") {
    if (cfg.processType === "parse_inbound") return "разобрать";
    if (cfg.processType === "draft_reply") return "черновик";
    if (cfg.processType === "client_ping") return "пинг";
    return "глубокий анализ";
  }
  if (cfg.actionType === "create_lead") return "создать лид";
  return "показать черновик";
}

function slotCaption(block: PreviewBlock, processes: PreviewProcess[]) {
  const cfg = asConfig(block.config);
  if (block.type !== "ai_process") return compactName(block);
  const proc = processes.find((p) => p.id === cfg.aiProcessId);
  const name = compactName(block);
  if (!proc?.binding) return `${name} (срочно человек)`;
  return `${name} (${proc.binding.provider}:${proc.binding.model})`;
}

export function buildFlowPreview(blocks: PreviewBlock[], processes: PreviewProcess[]) {
  if (!blocks.length) return { preview: "положите канал", compact: "положите канал" };
  const preview = blocks
    .map((b) => {
      const cfg = asConfig(b.config);
      if (b.type === "ai_process") {
        const proc = processes.find((p) => p.id === cfg.aiProcessId);
        if (!proc?.binding) return `${b.label} (срочно человек)`;
        return `${b.label} (${proc.binding.provider}:${proc.binding.model})`;
      }
      return b.label;
    })
    .join(" → ");
  const compact = blocks.map((b) => slotCaption(b, processes)).join(" → ");
  return { preview, compact };
}
