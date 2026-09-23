import { randomBytes } from "crypto";
import { prisma } from "./prisma";

export const VED_TEMPLATE = [
  { name: "ТН ВЭД", key: "tnved", fieldType: "tnved", required: true },
  { name: "Incoterms", key: "incoterms", fieldType: "incoterms", required: false },
  { name: "Контейнер", key: "container", fieldType: "container", required: false },
];

export const VED_KNOWLEDGE = {
  title: "Ориентир ТН ВЭД и поставка Китай → РФ",
  body: `Клиенту даём ориентир, не декларацию и не бронь судна.
Код ТН ВЭД — 10 цифр, глава 01–97 кроме 77. Спорный код, антидемпинг, «оптимизируйте любой ценой» — сразу к менеджеру.
Incoterms (часто FCA): продавец отдаёт товар перевозчику, дальше риск и логистика на покупателе.
Пошлина и НДС — оценка по коду и базе знаний, не счёт к оплате.
После ориентира просим контакт и передаём менеджеру, чтобы закрыть поставку.`,
};

export async function ensureWorkspaceFlow(workspaceId: string) {
  const existing = await prisma.flow.findFirst({ where: { workspaceId } });
  if (existing) return existing;
  return prisma.flow.create({
    data: { workspaceId, name: "Основная цепочка" },
  });
}

export async function applyVedTemplate(workspaceId: string) {
  for (const f of VED_TEMPLATE) {
    await prisma.customField.upsert({
      where: { workspaceId_key: { workspaceId, key: f.key } },
      update: {},
      create: { workspaceId, ...f },
    });
  }
  const existing = await prisma.knowledgeArticle.findFirst({
    where: { workspaceId, title: VED_KNOWLEDGE.title },
  });
  if (!existing) {
    let topic = await prisma.knowledgeTopic.findFirst({
      where: { workspaceId, name: "ТН ВЭД" },
    });
    if (!topic) {
      topic = await prisma.knowledgeTopic.create({
        data: { workspaceId, name: "ТН ВЭД" },
      });
    }
    await prisma.knowledgeArticle.create({
      data: { workspaceId, topicId: topic.id, title: VED_KNOWLEDGE.title, body: VED_KNOWLEDGE.body },
    });
  }
}

export function publicKey(): string {
  return randomBytes(12).toString("hex");
}

export function inviteToken(): string {
  return randomBytes(18).toString("hex");
}

export type BlockConfig = {
  channelId?: string;
  channelType?: "telegram" | "web_form" | "web_chat";
  aiProcessId?: string;
  processType?: "parse_inbound" | "draft_reply" | "deep_analysis";
  actionType?: "create_lead" | "show_draft";
  allowedOrigins?: string[];
};

export function asConfig(raw: unknown): BlockConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as BlockConfig;
}
