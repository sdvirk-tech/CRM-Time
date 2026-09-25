type Window = { count: number; resetAt: number };

const store = new Map<string, Window>();

function bucketKey(scope: string, ip: string, publicKey: string) {
  return scope === "key" ? `k:${publicKey}` : `ip:${ip}:${publicKey}`;
}

export function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}

export function checkIngestRateLimit(opts: {
  req: Request;
  publicKey: string;
  maxPerMinute: number;
  scope: "ip" | "key";
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const max = opts.maxPerMinute;
  if (!max || max <= 0) return { ok: true };
  const windowMs = 60_000;
  const now = Date.now();
  const ip = clientIp(opts.req);
  const key = bucketKey(opts.scope, ip, opts.publicKey);
  let w = store.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    store.set(key, w);
  }
  if (w.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((w.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  w.count += 1;
  return { ok: true };
}

export function ingestRateLimitedResponse(retryAfterSec: number) {
  return new Response(
    JSON.stringify({
      error: "Слишком много обращений. Подождите минуту и попробуйте снова.",
      retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}

export async function workspaceIngestLimits(workspaceId: string) {
  const { prisma } = await import("./prisma");
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ingestRateLimitMax: true, ingestRateLimitScope: true },
  });
  const scope = ws?.ingestRateLimitScope === "key" ? "key" : "ip";
  return { maxPerMinute: ws?.ingestRateLimitMax ?? 60, scope: scope as "ip" | "key" };
}
