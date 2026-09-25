const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeHost(input: string) {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  try {
    const withProto = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(withProto).host;
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}

function isLocalDevUrl(url: string) {
  try {
    const u = new URL(url);
    return LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function hostMatches(candidateHost: string, allowedEntry: string) {
  const host = normalizeHost(candidateHost);
  const rule = normalizeHost(allowedEntry);
  if (!host || !rule) return false;
  if (host === rule) return true;
  if (rule.startsWith("*.")) {
    const suffix = rule.slice(1);
    return host.endsWith(suffix) || host === rule.slice(2);
  }
  return host.includes(rule.replace(/^https?:\/\//, ""));
}

/** Пустой список = без ограничений (обратная совместимость). localhost всегда разрешён. */
export function embedOriginAllowed(
  workspaceOrigins: string[] | undefined,
  channelOrigins: string[] | undefined,
  origin: string | null,
  referer: string | null,
) {
  const merged = [...(workspaceOrigins || []), ...(channelOrigins || [])].map((s) => s.trim()).filter(Boolean);
  if (merged.length === 0) return true;
  const urls = [origin, referer].filter((u): u is string => Boolean(u));
  if (urls.length === 0) return true;
  for (const url of urls) {
    if (isLocalDevUrl(url)) return true;
    try {
      const host = new URL(url).host;
      if (merged.some((rule) => hostMatches(host, rule))) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

export function parseOriginsList(text: string) {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
