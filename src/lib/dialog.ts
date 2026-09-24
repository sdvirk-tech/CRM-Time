import { retrieveKnowledgeChunks } from "./rag";

export function isStartCommand(body: string): boolean {
  return /^\/start\b/i.test(body.trim());
}

export function wantsManager(body: string): boolean {
  const t = body.toLowerCase();
  return (
    /хочу\s+менеджер/.test(t) ||
    /позовите\s+(менеджер|оператор|человек)/.test(t) ||
    /переведите\s+(на\s+)?(менеджер|оператор|человек)/.test(t) ||
    /нужен\s+(живой\s+)?(менеджер|оператор)/.test(t) ||
    /живой\s+оператор/.test(t) ||
    /свяжите\s+с\s+менеджер/.test(t)
  );
}

export function extractPhone(text: string): string | null {
  const chunks = text.match(/\+?\d[\d\s().-]{8,18}\d/g) ?? [];
  for (const chunk of chunks) {
    const digits = chunk.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) continue;
    if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
    if (digits.length === 10) return `7${digits}`;
    return digits;
  }
  return null;
}

export function pickKnowledge<T extends { title: string; body: string }>(articles: T[], query: string, limit = 4): T[] {
  return retrieveKnowledgeChunks(articles, query, limit) as T[];
}

export function sanitizeModelText(text: string): string {
  let t = text.replace(/\r\n/g, "\n");
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  t = t.replace(/```(?:thinking|reason(?:ing)?)[\s\S]*?```/gi, "");
  t = t.replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, "[токен]");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function defaultGreeting(): string {
  return "Здравствуйте! Помогу предварительно определить код ТН ВЭД. Опишите товар, пришлите ссылку или фото.";
}

export const AI_DRAFT_LIMIT = 8;
