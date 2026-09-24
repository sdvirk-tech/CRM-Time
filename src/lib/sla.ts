export function isStale(opts: {
  status: string;
  slaMinutes: number;
  lastInboundAt: Date | null | undefined;
  lastOutboundAt: Date | null | undefined;
  now?: Date;
}) {
  if (opts.status === "closed") return false;
  if (!opts.lastInboundAt) return false;
  if (opts.lastOutboundAt && opts.lastOutboundAt >= opts.lastInboundAt) return false;
  const now = opts.now ?? new Date();
  const waited = now.getTime() - opts.lastInboundAt.getTime();
  const limit = Math.max(0, opts.slaMinutes) * 60 * 1000;
  return waited >= limit;
}

export function startOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function lastByDirection(
  messages: { direction: string; createdAt: Date }[],
  direction: string,
) {
  return messages.find((m) => m.direction === direction) ?? null;
}
