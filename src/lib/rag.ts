import { prisma } from "./prisma";

export type KnowledgeChunk = { title: string; body: string; articleId?: string };

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
}

export function chunkArticle(title: string, body: string, articleId?: string): KnowledgeChunk[] {
  const paras = String(body || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const pieces: string[] = [];
  let buf = "";
  const push = () => {
    if (buf.trim()) pieces.push(buf.trim());
    buf = "";
  };
  for (const p of paras.length ? paras : [String(body || "").trim()]) {
    if (!p) continue;
    if (p.length > 700) {
      push();
      for (let i = 0; i < p.length; i += 520) pieces.push(p.slice(i, i + 600).trim());
      continue;
    }
    if (buf && buf.length + p.length > 520) push();
    buf = buf ? `${buf}\n${p}` : p;
  }
  push();
  const out = (pieces.length ? pieces : [String(body || "").trim()]).filter(Boolean);
  return out.map((c) => ({ title, body: c, articleId }));
}

function bm25(chunk: KnowledgeChunk, queryTokens: string[], avgLen: number, ftsBoost: boolean) {
  const hay = `${chunk.title}\n${chunk.body}`.toLowerCase();
  const words = tokenize(hay);
  const tf = new Map<string, number>();
  for (const w of words) tf.set(w, (tf.get(w) || 0) + 1);
  const k1 = 1.2;
  const b = 0.75;
  const dl = Math.max(words.length, 1);
  let score = 0;
  for (const q of queryTokens) {
    const f = tf.get(q) || (hay.includes(q) ? 1 : 0);
    if (!f) continue;
    score += (f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgLen)));
    if (chunk.title.toLowerCase().includes(q)) score += 0.9;
  }
  const phrase = queryTokens.join(" ");
  if (phrase.length > 5 && hay.includes(phrase)) score += 2;
  if (ftsBoost) score += 1.4;
  return score;
}

export function retrieveKnowledgeChunks(
  articles: { id?: string; title: string; body: string }[],
  query: string,
  limit = 4,
  ftsIds?: Set<string>,
): KnowledgeChunk[] {
  if (!articles.length) return [];
  const chunks = articles.flatMap((a) => chunkArticle(a.title, a.body, a.id));
  const qTokens = tokenize(query);
  if (!qTokens.length) return chunks.slice(0, limit);
  const avgLen = chunks.reduce((s, c) => s + tokenize(c.body).length, 0) / Math.max(chunks.length, 1) || 1;
  const ranked = chunks
    .map((c) => ({ c, score: bm25(c, qTokens, avgLen, Boolean(c.articleId && ftsIds?.has(c.articleId))) }))
    .sort((a, b) => b.score - a.score);
  const hits = ranked.filter((r) => r.score > 0).map((r) => r.c);
  return (hits.length ? hits : chunks).slice(0, limit);
}

export async function loadKnowledgeForPrompt(workspaceId: string, topicId: string | null | undefined, query: string) {
  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      workspaceId,
      enabled: true,
      ...(topicId ? { topicId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const ftsIds = new Set<string>();
  const q = query.trim().slice(0, 200);
  if (q.length >= 3) {
    try {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM knowledge_articles
        WHERE workspace_id = ${workspaceId}
          AND enabled = true
          AND to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))
              @@ plainto_tsquery('simple', ${q})
        ORDER BY ts_rank(
          to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,'')),
          plainto_tsquery('simple', ${q})
        ) DESC
        LIMIT 12
      `;
      for (const r of rows) ftsIds.add(r.id);
    } catch {
      /* simple FTS недоступен — только чанки BM25 */
    }
  }
  return retrieveKnowledgeChunks(articles, query, 4, ftsIds);
}
