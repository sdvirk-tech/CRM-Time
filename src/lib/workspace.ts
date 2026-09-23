import { randomBytes } from "crypto";
import { prisma } from "./prisma";

export const VED_TEMPLATE = [
  { name: "ТН ВЭД", key: "tnved", fieldType: "tnved", required: true },
  { name: "Incoterms", key: "incoterms", fieldType: "incoterms", required: false },
  { name: "Контейнер", key: "container", fieldType: "container", required: false },
];

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
}

export function publicKey(): string {
  return randomBytes(12).toString("hex");
}

export function inviteToken(): string {
  return randomBytes(18).toString("hex");
}

export type BlockConfig = {
  channelId?: string;
  channelType?: "telegram" | "web_form";
  aiProcessId?: string;
  processType?: "parse_inbound" | "draft_reply" | "deep_analysis";
  actionType?: "create_lead" | "show_draft";
  allowedOrigins?: string[];
};

export function asConfig(raw: unknown): BlockConfig {
  if (!raw || typeof raw !== "object") return {};
  return raw as BlockConfig;
}
