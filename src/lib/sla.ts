export function isStale(opts: {
  status: string;
  slaMinutes: number;
  lastInboundAt: Date | null | undefined;
  lastOutboundAt: Date | null | undefined;
  now?: Date;
}) {
  if (opts.status === "closed") return false;
  const now = opts.now ?? new Date();
  const limit = Math.max(0, opts.slaMinutes) * 60 * 1000;
  const lastIn = opts.lastInboundAt ? new Date(opts.lastInboundAt).getTime() : null;
  const lastOut = opts.lastOutboundAt ? new Date(opts.lastOutboundAt).getTime() : null;
  if (lastIn == null && lastOut == null) return false;
  // Client wrote last — waiting for us.
  if (lastIn != null && (lastOut == null || lastIn > lastOut)) {
    return now.getTime() - lastIn >= limit;
  }
  // We wrote last (manager send or bot) — client silent, cheap follow-up.
  if (lastOut != null && (lastIn == null || lastOut >= lastIn)) {
    return now.getTime() - lastOut >= limit;
  }
  return false;
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
