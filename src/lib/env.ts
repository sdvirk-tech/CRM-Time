export function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function deployMode(): "saas" | "box" {
  return env("DEPLOY_MODE", "saas") === "box" ? "box" : "saas";
}

export function appUrl(): string {
  return (env("PUBLIC_URL") || env("APP_URL") || "http://localhost:3000").replace(/\/$/, "");
}

export function publicUrl(): string {
  return appUrl();
}

export function appSecret(): string {
  const s = env("APP_SECRET", "dev-secret-change-me-please-32chars");
  return s.length >= 16 ? s : s.padEnd(16, "x");
}
