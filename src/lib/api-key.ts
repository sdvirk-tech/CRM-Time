import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { appSecret } from "./env";

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(`${appSecret()}:${raw}`).digest("hex");
}

export function generateWorkspaceApiKey() {
  const raw = `crm_${randomBytes(24).toString("base64url")}`;
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, 14),
  };
}

export function parseBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

export async function requireApiKeyWorkspace(req: Request): Promise<{ workspaceId: string; apiKeyId: string } | null> {
  const raw = parseBearerToken(req);
  if (!raw) return null;
  const keyHash = hashApiKey(raw);
  const row = await prisma.workspaceApiKey.findFirst({
    where: { keyHash, revokedAt: null },
  });
  if (!row) return null;
  return { workspaceId: row.workspaceId, apiKeyId: row.id };
}

export function safeEqualHash(a: string, b: string) {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
